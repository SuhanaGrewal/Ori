from __future__ import annotations

import os

import uvicorn


def main() -> None:
    # Railway (and most PaaS hosts) assign the listen port dynamically via
    # $PORT and route to it on 0.0.0.0; 127.0.0.1/8420 remains the local-dev
    # default so nothing changes for `python -m ori.webchat` on a laptop.
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8420"))
    uvicorn.run("ori.webchat.server:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
