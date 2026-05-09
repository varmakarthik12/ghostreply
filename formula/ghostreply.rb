class Ghostreply < Formula
  desc "Cross-Platform Unified Identity AI Agent"
  homepage "https://github.com/varmakarthik12/ghostreply"
  url "https://github.com/varmakarthik12/ghostreply/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000" # Placeholder
  license "MIT"

  depends_on "go" => :build
  depends_on "node" => :build

  def install
    system "cd ui && npm install && npm run build"
    system "go", "build", *std_go_args(output: bin/"ghostreply"), "./cmd/ghostreply"
  end

  test do
    system "#{bin}/ghostreply", "--version"
  end
end
