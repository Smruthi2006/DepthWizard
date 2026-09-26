"""
DepthWizard - One-Click Launcher
ISRO SAC SIH 26175: Single-View Height Estimation & 3D Flythrough
Starts the unified backend and serves the interactive 3D WebGL application.
"""

import os
import sys
import webbrowser
import uvicorn

if __name__ == "__main__":
    host = "127.0.0.1"
    port = 8000
    url = f"http://{host}:{port}"
    print("=" * 70)
    print("  🛰️  ISRO SAC SIH 26175: DepthWizard Platform Launcher")
    print("  Single-View Height Estimation & 3D Flythrough Engine")
    print(f"  Target Server: {url}")
    print("=" * 70)

    # Launch browser after a brief delay
    def open_browser():
        import time
        time.sleep(1.5)
        webbrowser.open(url)

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run("backend.app:app", host=host, port=port, reload=False, log_level="info")
