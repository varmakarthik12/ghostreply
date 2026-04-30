package main

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

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
	llmURL    = flag.String("llm-url", "http://localhost:11434", "LLM base URL (Ollama or any OpenAI-compatible endpoint)")
)

// defaultDBPath returns ~/.ghostreply/ghostreply.db, creating the directory if needed.
func defaultDBPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	dir := filepath.Join(home, ".ghostreply")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("cannot create data directory %s: %w", dir, err)
	}
	return filepath.Join(dir, "ghostreply.db"), nil
}

func generateToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return strings.ToUpper(hex.EncodeToString(b))
}

func main() {
	flag.Parse()

	resolvedDB := *dbPath
	usingDefault := false
	if resolvedDB == "" {
		var err error
		resolvedDB, err = defaultDBPath()
		if err != nil {
			log.Fatalf("db: %v", err)
		}
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

	apiHandler := api.NewAPI(store, token, *llmURL, func(baseURL, apiKey string) chat.LLM {
		// LLM_KEY env is the generic name; fall back to OPENAI_API_KEY for backward compat.
		key := apiKey
		if key == "" {
			key = os.Getenv("LLM_KEY")
		}
		if key == "" {
			key = os.Getenv("OPENAI_API_KEY")
		}
		return llm.NewClient(baseURL, key)
	})
	apiHandler.Worker.Start()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		dbOK := store.Ping() == nil
		prefix := token
		if len(prefix) > 8 {
			prefix = prefix[:8]
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","token_prefix":"%s","llm_url":"%s","db_ok":%t}`, prefix, *llmURL, dbOK)
	})

	r.Route("/api", func(r chi.Router) { apiHandler.Mount(r) })

	// Serve embedded UI. Files live under "dist/" inside the embed FS.
	r.Get("/*", spaHandler())

	dbLabel := resolvedDB
	if usingDefault {
		dbLabel = resolvedDB + "  (default)"
	}
	fmt.Printf("=== GhostReply ===\n")
	fmt.Printf("Token: %s\n", token)
	fmt.Printf("Port:  %s\n", *port)
	fmt.Printf("DB:    %s\n", dbLabel)
	fmt.Printf("LLM:   %s\n", *llmURL)
	fmt.Printf("Open   http://localhost:%s\n", *port)
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
