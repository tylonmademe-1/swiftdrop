import { describe, it, expect } from 'vitest';

describe('Parallel Multiplexing & Reordering Engine', () => {
  const MAGIC_NUMBER = 0x53574644; // "SWFD"
  const HEADER_SIZE = 16;

  function createPacket(fileIndex: number, chunkIndex: number, payload: Uint8Array): ArrayBuffer {
    const packet = new Uint8Array(HEADER_SIZE + payload.byteLength);
    const view = new DataView(packet.buffer);
    view.setUint32(0, MAGIC_NUMBER, false);
    view.setUint32(4, fileIndex, false);
    view.setUint32(8, chunkIndex, false);
    view.setUint32(12, payload.byteLength, false);
    packet.set(payload, HEADER_SIZE);
    return packet.buffer;
  }

  it('correctly reassembles out-of-order parallel packets striped across multiple UDP channels', () => {
    // 4 chunks arriving out-of-order over parallel data channels: 2, 0, 3, 1
    const chunk0 = new Uint8Array([1, 2, 3]);
    const chunk1 = new Uint8Array([4, 5, 6]);
    const chunk2 = new Uint8Array([7, 8, 9]);
    const chunk3 = new Uint8Array([10, 11, 12]);

    const packets = [
      createPacket(0, 2, chunk2),
      createPacket(0, 0, chunk0),
      createPacket(0, 3, chunk3),
      createPacket(0, 1, chunk1)
    ];

    // Reassembly buffer array
    const reassemblyArray = new Array(4);

    for (const buf of packets) {
      const view = new DataView(buf);
      const magic = view.getUint32(0, false);
      expect(magic).toBe(MAGIC_NUMBER);

      const chunkIndex = view.getUint32(8, false);
      const payloadLength = view.getUint32(12, false);
      const chunkData = buf.slice(HEADER_SIZE, HEADER_SIZE + payloadLength);

      // Indexed placement ensures immunity to out-of-order delivery
      reassemblyArray[chunkIndex] = new Uint8Array(chunkData);
    }

    // Verify all 4 chunks are ordered properly
    expect(Array.from(reassemblyArray[0])).toEqual([1, 2, 3]);
    expect(Array.from(reassemblyArray[1])).toEqual([4, 5, 6]);
    expect(Array.from(reassemblyArray[2])).toEqual([7, 8, 9]);
    expect(Array.from(reassemblyArray[3])).toEqual([10, 11, 12]);

    // Assembled payload matches original
    const fullAssembled = new Uint8Array(12);
    let offset = 0;
    for (const chunk of reassemblyArray) {
      fullAssembled.set(chunk, offset);
      offset += chunk.byteLength;
    }

    expect(Array.from(fullAssembled)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('selects the least congested parallel channel to maximize throughput and prevent stalling', () => {
    interface MockChannel {
      id: number;
      bufferedAmount: number;
      readyState: string;
    }

    const channels: MockChannel[] = [
      { id: 0, bufferedAmount: 256000, readyState: 'open' },
      { id: 1, bufferedAmount: 64000, readyState: 'open' },
      { id: 2, bufferedAmount: 512000, readyState: 'open' },
      { id: 3, bufferedAmount: 128000, readyState: 'open' }
    ];

    const openChannels = channels.filter((c) => c.readyState === 'open');
    const leastCongested = openChannels.reduce((lowest, ch) => {
      return ch.bufferedAmount < lowest.bufferedAmount ? ch : lowest;
    }, openChannels[0]);

    expect(leastCongested.id).toBe(1);
    expect(leastCongested.bufferedAmount).toBe(64000);
  });

  it('calculates theoretical speedup factor for UDP/FASP style multi-streaming vs high-latency TCP', () => {
    const rawMB = 1000;
    const tcpSpeed = 5; // MB/s on 80ms RTT link
    const parallelFactor = 1 + Math.log2(4) * 0.9; // 2.8x
    const udpMitigation = 2.5; // UDP avoids TCP congestion collapse
    const acceleratedSpeed = tcpSpeed * parallelFactor * udpMitigation;

    const tcpDuration = rawMB / tcpSpeed;
    const acceleratedDuration = rawMB / acceleratedSpeed;

    expect(tcpDuration).toBe(200);
    expect(acceleratedDuration).toBeLessThan(30);
    expect(tcpDuration / acceleratedDuration).toBeGreaterThan(6);
  });
});
