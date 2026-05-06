.PHONY: dev dev-backend dev-frontend build

# Default target
dev:
	@echo "Starting backend and frontend in dev mode..."
	make -j 2 dev-backend dev-frontend

dev-backend:
	@echo "Starting Go backend with Air (hot reload)..."
	@if not exist "ui\dist" mkdir "ui\dist"
	@if not exist "ui\dist\.gitkeep" echo. > "ui\dist\.gitkeep"
	air

dev-frontend:
	@echo "Starting Vite frontend..."
	cd ui && npm run dev

build:
	@echo "Building frontend..."
	cd ui && npm run build
	@echo "Building backend..."
	go build -ldflags "-H=windowsgui" -o ghostreply.exe ./cmd/ghostreply/main.go
	go build  -o ghostreply2.exe ./cmd/ghostreply/main.go

clean:
	rm -rf tmp
	rm -rf ui/dist
	rm -f ghostreply.exe
