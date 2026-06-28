from pathlib import Path

p = Path("listings.db")
data = p.read_bytes()
print(f"Файл: {p.name} | размер: {len(data)} байт")
print()

def hexdump(b: bytes, start: int = 0):
    for off in range(0, len(b), 16):
        chunk = b[off:off + 16]
        hexpart = " ".join(f"{x:02x}" for x in chunk)
        asciipart = "".join(chr(x) if 32 <= x < 127 else "." for x in chunk)
        print(f"{start + off:08x}  {hexpart:<47}  {asciipart}")

print("=== Первые 256 байт (заголовок SQLite) ===")
hexdump(data[:256])
