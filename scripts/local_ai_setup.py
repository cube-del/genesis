"""Install the pinned DayTrace vision-language model and Windows Vulkan runtime."""

import concurrent.futures
import hashlib
import os
from pathlib import Path
import shutil
import sys
import time
import urllib.request
import zipfile


VERSION = "b12589"
MODEL_REVISION = "52d6c8ffea26cc873ac5ad116f8631268d7eb503"
MODELS = "https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/" + MODEL_REVISION + "/"
RUNTIME = f"https://github.com/ggml-org/llama.cpp/releases/download/{VERSION}/llama-{VERSION}-bin-win-vulkan-x64.zip"
FILES = (
    ("Qwen3VL-2B-Instruct-Q4_K_M.gguf", MODELS + "Qwen3VL-2B-Instruct-Q4_K_M.gguf", 1107409952, "089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae"),
    ("mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf", MODELS + "mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf", 445053216, "f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82"),
    (f"llama-{VERSION}.zip", RUNTIME, 38846606, "c1f318725dbad0bc85134b4dfd14ac147001bccbaec3694fc4931b4c99c05f0b"),
)


def download(root, entry):
    name, url, expected_size, expected_hash = entry
    target = root / name
    if target.is_file() and target.stat().st_size == expected_size:
        with target.open("rb") as current:
            if hashlib.file_digest(current, "sha256").hexdigest() == expected_hash:
                return target
    partial = root / (name + ".part")
    for attempt in range(3):
        start = partial.stat().st_size if partial.exists() else 0
        if start == expected_size:
            break
        headers = {"User-Agent": "DayTrace-Local-Setup/1.0", "Accept-Encoding": "identity"}
        if 0 < start < expected_size:
            headers["Range"] = f"bytes={start}-"
        try:
            req = urllib.request.Request(url + "?download=true&t=" + str(int(time.time())), headers=headers)
            with urllib.request.urlopen(req, timeout=90) as response:
                append = response.status == 206 and response.headers.get("Content-Range", "").startswith(f"bytes {start}-")
                with partial.open("ab" if append else "wb") as stream:
                    shutil.copyfileobj(response, stream, 1024 * 1024)
            if partial.stat().st_size == expected_size:
                break
        except OSError as error:
            if attempt == 2:
                raise RuntimeError(f"Download failed for {name}: {type(error).__name__}") from None
            time.sleep(1 + attempt)
    with partial.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    if digest != expected_hash:
        partial.unlink()
        raise RuntimeError(f"SHA-256 check failed for {name}; run setup again.")
    partial.replace(target)
    print(f"Verified {name}", flush=True)
    return target


def main():
    if sys.platform != "win32":
        raise SystemExit("This installer contains the Windows x64 Vulkan release of llama.cpp.")
    root = Path(os.getenv("DAYTRACE_LOCAL_AI_DIR") or Path(os.environ["LOCALAPPDATA"]) / "DayTrace" / "local-ai")
    root.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        model, projection, bundle = pool.map(lambda entry: download(root, entry), FILES)
    runtime = root / VERSION
    runtime.mkdir(exist_ok=True)
    with zipfile.ZipFile(bundle) as archive:
        for entry in archive.infolist():
            basename = Path(entry.filename).name
            if basename == "llama-server.exe" or basename.lower().endswith(".dll"):
                dest = runtime / basename
                if dest.exists() and dest.stat().st_size == entry.file_size:
                    with archive.open(entry) as original, dest.open("rb") as current:
                        if hashlib.file_digest(original, "sha256").digest() == hashlib.file_digest(current, "sha256").digest():
                            continue
                temp = dest.with_suffix(dest.suffix + ".part")
                with archive.open(entry) as source, temp.open("wb") as output:
                    shutil.copyfileobj(source, output)
                temp.replace(dest)
    if not (runtime / "llama-server.exe").is_file() or not model.is_file() or not projection.is_file():
        raise RuntimeError("Local model installation is incomplete.")
    print("Local Qwen3-VL is ready.")


if __name__ == "__main__":
    main()
