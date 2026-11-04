import requests
from pathlib import Path

BASE = "http://127.0.0.1:8080"

def main():
    s = requests.get(BASE + "/state", timeout=5)
    s.raise_for_status()
    state = s.json()
    assert {"state", "x", "y", "heading", "holding", "retry_count"} <= set(state)
    forbidden = {"objects", "object_ids", "object_positions", "drop_zone", "object_count"}
    assert not (forbidden & set(state)), "Potential object-data leakage in /state"

    look = requests.get(BASE + "/look", timeout=10)
    look.raise_for_status()
    assert look.headers.get("content-type", "").startswith("image/jpeg")
    Path("logs/frames").mkdir(parents=True, exist_ok=True)
    Path("logs/frames/smoke_test.jpg").write_bytes(look.content)

    depth = requests.get(BASE + "/depth", timeout=5)
    depth.raise_for_status()
    print("STATE:", state)
    print("CAMERA: JPEG received")
    print("DEPTH:", depth.json())
    print("Engine smoke test passed. Test movement/pickup/drop manually through /docs.")

if __name__ == "__main__":
    main()
