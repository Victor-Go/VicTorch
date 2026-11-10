const TABLE32 = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/** CRC32 (IEEE). `prev` allows chaining over several buffers. */
export const crc32 = (data: Uint8Array, prev = 0): number => {
  let c = ~prev >>> 0;
  for (let i = 0; i < data.length; i++) c = TABLE32[(c ^ data[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
};

export const crc16 = (data: Uint8Array): number => {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
};
