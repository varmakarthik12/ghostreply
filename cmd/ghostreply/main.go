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
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/varmakarthik12/ghostreply/internal/api"
	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/ui"
)

var (
	port     = flag.String("port", "8080", "Port to listen on")
	token    = flag.String("token", "", "Bearer token (generated if empty)")
	dbPath   = flag.String("db-path", "ghostreply.db", "SQLite database path")
	ollamaURL = flag.String("ollama-url", "http://localhost:11434", "Ollama base URL")
)

func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func main() {
	flag.Parse()

	// Generate token if not provided
	authToken := *token
	if authToken == "" {
		authToken = os.Getenv("GHOSTREPLY_TOKEN")
	}
	if authToken == "" {
		authToken = generateToken()
	}

	// Open database
	store, err := db.NewStore(*dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer store.Close()

	// Set up default global model config
	store.SaveModelConfig(&db.ModelConfig{
		Scope: "global", Provider: "ollama", ModelName: "gemma3:4b",
		BaseURL: *ollamaURL, ContextWindowTokens: 8192,
	})

	// Set up router
	r := chi.NewMux()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Health endpoint (no auth)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json := fmt.Sprintf(`{"status":"ok","token_prefix":"%s","ollama_url":"%s","db_ok":true}`,
			strings.ToUpper(authToken[:8]), *ollamaURL)
		w.Write([]byte(json))
	})

	// API routes with auth
	apiHandler := api.NewAPI(store, authToken, *ollamaURL)
	r.Route("/api", func(r chi.Router) {
		apiHandler.Mount(r)
	})

	// Serve embedded React UI
	distFS, _ := fs.Sub(ui.EmbeddedUI, "dist")
	spaFS := &spaFileServer{fs: http.FS(distFS)}
	r.Handle("/*", spaFS)

	// Print startup info
	fmt.Printf("=== GhostReply ===\n")
	fmt.Printf("Token: %s\n", authToken)
	fmt.Printf("Port: %s\n", *port)
	fmt.Printf("DB: %s\n", *dbPath)
	fmt.Printf("Ollama: %s\n", *ollamaURL)
	fmt.Printf("UI: embedded\n")
	fmt.Printf("================\n")
	fmt.Printf("Open http://localhost:%s in your browser\n", *port)

	log.Fatal(http.ListenAndServe(":"+*port, r))
}

// spaFileServer serves index.html for all non-file routes (SPA fallback)
type spaFileServer struct {
	fs http.FileSystem
}

func (s *spaFileServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if !strings.HasPrefix(path, "/api/") && path != "/health" {
		if path == "/" {
			path = "/index.html"
		}
		f, err := s.fs.Open(strings.TrimPrefix(path, "/"))
		if err == nil {
			defer f.Close()
			stat, _ := f.Stat()
			if stat != nil && !stat.IsDir() {
				http.ServeFile(w, r, strings.TrimPrefix(path, "/"))
				return
			}
		}
		// Fallback to index.html for SPA
		if idx, err := s.fs.Open("index.html"); err == nil {
			defer idx.Close()
			http.ServeContent(w, r, "/index.html", time.Time{}, idx)
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	}
}
