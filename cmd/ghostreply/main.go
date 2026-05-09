package main

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/varmakarthik12/ghostreply/internal/api"
	"github.com/varmakarthik12/ghostreply/internal/chat"
	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/internal/llm"
	"github.com/varmakarthik12/ghostreply/ui"
)

var (
	port      = flag.String("port", "8080", "Port to listen on")
	tokenFlag = flag.String("token", "", "Bearer token (auto-generated if empty)")
	dbPath    = flag.String("db-path", "", "SQLite database file path (default: ~/.ghostreply/ghostreply.db)")
)

// defaultDataDir returns ~/.ghostreply, creating the directory if needed.
func defaultDataDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	dir := filepath.Join(home, ".ghostreply")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("cannot create data directory %s: %w", dir, err)
	}
	return dir, nil
}

// setupLogging rotates the old log file and sets up the standard logger to write to both stdout and a new logs.txt.
func setupLogging(dataDir string) error {
	logFile := filepath.Join(dataDir, "logs.txt")

	// Rotate old log file if it exists
	if _, err := os.Stat(logFile); err == nil {
		timestamp := time.Now().Format("20060102_150405")
		rotatedFile := filepath.Join(dataDir, fmt.Sprintf("log_%s.txt", timestamp))
		if err := os.Rename(logFile, rotatedFile); err != nil {
			return fmt.Errorf("failed to rotate log file: %w", err)
		}
	}

	f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return fmt.Errorf("failed to create log file: %w", err)
	}

	// Use MultiWriter to write to both stdout and the file
	multi := io.MultiWriter(os.Stdout, f)
	log.SetOutput(multi)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	return nil
}

func generateToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return strings.ToUpper(hex.EncodeToString(b))
}

func main() {
	flag.Parse()

	dataDir, err := defaultDataDir()
	if err != nil {
		log.Fatalf("setup: %v", err)
	}

	if err := setupLogging(dataDir); err != nil {
		log.Fatalf("logging: %v", err)
	}

	resolvedDB := *dbPath
	usingDefault := false
	if resolvedDB == "" {
		resolvedDB = filepath.Join(dataDir, "ghostreply.db")
		usingDefault = true
	}

	token := *tokenFlag
	if token == "" {
		token = os.Getenv("GHOSTREPLY_TOKEN")
	}
	if token == "" {
		token = generateToken()
	}

	store, err := db.NewStore(resolvedDB)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer store.Close()

	if _, err := store.CreateServerSession(); err != nil {
		log.Printf("[DB] Warning: failed to create server session: %v", err)
	}

	apiHandler := api.NewAPI(store, token, store.GetConfigValue("llm_url", "http://localhost:11434"), func(baseURL, apiKey string, timeout time.Duration) chat.LLM {
		// LLM_KEY env is the generic name; fall back to OPENAI_API_KEY for backward compat.
		key := apiKey
		if key == "" {
			key = os.Getenv("LLM_KEY")
		}
		if key == "" {
			key = os.Getenv("OPENAI_API_KEY")
		}
		return llm.NewClient(baseURL, key, timeout)
	})
	apiHandler.Worker.Start()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		dbOK := store.Ping() == nil
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","llm_url":"%s","db_ok":%t}`, store.GetConfigValue("llm_url", "http://localhost:11434"), dbOK)
	})

	r.Route("/api", func(r chi.Router) { apiHandler.Mount(r) })

	// Serve embedded UI. Files live under "dist/" inside the embed FS.
	r.Get("/*", spaHandler())

	dbLabel := resolvedDB
	if usingDefault {
		dbLabel = resolvedDB + "  (default)"
	}
	log.Printf("=== GhostReply ===")
	log.Printf("Token: %s", token)
	log.Printf("Port:  %s", *port)
	log.Printf("DB:    %s", dbLabel)
	log.Printf("LLM:   %s", store.GetConfigValue("llm_url", "http://localhost:11434"))
	log.Printf("Open   http://localhost:%s", *port)
	log.Fatal(http.ListenAndServe(":"+*port, r))
}

func spaHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" || path == "" {
			path = "/index.html"
		}
		clean := strings.TrimPrefix(path, "/")
		f, err := ui.EmbeddedUI.Open("dist/" + clean)
		if err != nil {
			// SPA fallback
			f, err = ui.EmbeddedUI.Open("dist/index.html")
			if err != nil {
				http.NotFound(w, r)
				return
			}
		}
		defer f.Close()
		stat, _ := f.Stat()
		if stat != nil && stat.IsDir() {
			f, _ = ui.EmbeddedUI.Open("dist/index.html")
			defer f.Close()
		}
		// content type from extension
		switch {
		case strings.HasSuffix(clean, ".html"):
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		case strings.HasSuffix(clean, ".css"):
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		case strings.HasSuffix(clean, ".js"):
			w.Header().Set("Content-Type", "application/javascript")
		case strings.HasSuffix(clean, ".json"):
			w.Header().Set("Content-Type", "application/json")
		default:
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		}
		buf, err := fs.ReadFile(ui.EmbeddedUI, "dist/"+clean)
		if err != nil {
			buf, _ = fs.ReadFile(ui.EmbeddedUI, "dist/index.html")
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		}
		w.Write(buf)
	}
}
