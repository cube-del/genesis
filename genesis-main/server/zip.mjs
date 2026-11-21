import { deflateRawSync } from 'node:zlib';

const checksumTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return value >>> 0;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ checksumTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

// Write a standard ZIP with UTF-8 filenames. Original media is already compressed.
export function makeZip(files) {
  const entries = [];
  const directory = [];
  let offset = 0;
  let directoryBytes = 0;
  for (const [filename, data] of files) {
    const name = Buffer.from(filename);
    const method = /\.(html|json|txt|wav)$/i.test(filename) ? 8 : 0;
    const compressed = method ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(33, 12); // 1980-01-01, the earliest valid DOS date.
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    local.copy(central, 6, 4, 30);
    central.writeUInt32LE(offset, 42);
    entries.push(local, name, compressed);
    directory.push(central, name);
    offset += local.length + name.length + compressed.length;
    directoryBytes += central.length + name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directoryBytes, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries, ...directory, end]);
}
