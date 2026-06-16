import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(__dirname, "..", "assets", "source.png");
const OUT_DIR = path.join(__dirname, "..", "assets");

mkdirSync(OUT_DIR, { recursive: true });

// Sizes for the .ico file (Windows picks the closest match)
const ICO_SIZES = [16, 24, 32, 48, 64, 256];

async function main() {
  const sourceBuf = readFileSync(SOURCE);

  // Generate individual PNGs for each size
  const pngs = [];
  for (const size of ICO_SIZES) {
    const buf = await sharp(sourceBuf).resize(size, size).png().toBuffer();
    pngs.push({ size, buf });
  }

  // Write .ico file (multi-resolution, PNG-compressed)
  // ICO header: 2 bytes reserved(0) + 2 bytes type(1=ICO) + 2 bytes count
  // ICO dir entry: 1b width + 1b height + 1b palette(0) + 1b reserved(0) + 2b planes(1) + 2b bpp(32) + 4b size + 4b offset
  const HEADER_SIZE = 6;
  const ENTRY_SIZE = 16;
  const count = pngs.length;

  let dataOffset = HEADER_SIZE + count * ENTRY_SIZE;
  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: ICO
  header.writeUInt16LE(count, 4); // count

  const entries = [];
  const imageBuffers = [];

  for (const { size, buf } of pngs) {
    const entry = Buffer.alloc(ENTRY_SIZE);
    const w = size >= 256 ? 0 : size; // 256 → 0 in ICO spec
    entry.writeUInt8(w, 0);           // width (0 means 256)
    entry.writeUInt8(w, 1);           // height
    entry.writeUInt8(0, 2);           // color palette
    entry.writeUInt8(0, 3);           // reserved
    entry.writeUInt16LE(1, 4);        // color planes
    entry.writeUInt16LE(32, 6);       // bits per pixel
    entry.writeUInt32LE(buf.length, 8); // image size
    entry.writeUInt32LE(dataOffset, 12); // offset
    entries.push(entry);
    imageBuffers.push(buf);
    dataOffset += buf.length;
  }

  const icoPath = path.join(OUT_DIR, "icon.ico");
  const ws = createWriteStream(icoPath);
  ws.write(header);
  for (const e of entries) ws.write(e);
  for (const b of imageBuffers) ws.write(b);
  ws.end();
  console.log("Written:", icoPath);

  // Tray icons (PNG — Electron uses these for system tray)
  for (const traySize of [16, 32]) {
    const trayBuf = await sharp(sourceBuf).resize(traySize, traySize).png().toBuffer();
    const trayPath = path.join(OUT_DIR, `tray-${traySize}.png`);
    const tws = createWriteStream(trayPath);
    tws.write(trayBuf);
    tws.end();
    console.log("Written:", trayPath);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
