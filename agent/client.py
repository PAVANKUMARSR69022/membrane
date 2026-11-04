import requests


class EngineClient:
    def __init__(self, base_url="http://127.0.0.1:8080", timeout=30):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()

    def state(self):
        response = self.session.get(
            f"{self.base_url}/state", timeout=self.timeout
        )
        response.raise_for_status()
        return response.json()

    def look(self):
        r = self.session.get(f"{self.base_url}/look", timeout=self.timeout)
        r.raise_for_status()
        if r.headers.get("content-type", "").split(";", 1)[0] != "image/jpeg":
            raise ValueError("Engine camera did not return a JPEG image")
        return r.content

    def depth(self):
        response = self.session.get(
            f"{self.base_url}/depth", timeout=self.timeout
        )
        response.raise_for_status()
        return response.json()["distance"]

    def move(self, distance):
        response = self.session.post(
            f"{self.base_url}/move",
            json={"distance": distance},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def turn(self, degrees):
        response = self.session.post(
            f"{self.base_url}/turn",
            json={"degrees": degrees},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def pickup(self):
        response = self.session.post(
            f"{self.base_url}/pickup", timeout=self.timeout
        )
        response.raise_for_status()
        return response.json()

    def drop(self):
        response = self.session.post(
            f"{self.base_url}/drop", timeout=self.timeout
        )
        response.raise_for_status()
        return response.json()

    def start_task(self, task_id):
        response = self.session.post(
            f"{self.base_url}/task/start",
            json={"task_id": task_id},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def close(self):
        self.session.close()
