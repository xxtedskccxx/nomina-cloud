const net = require('net');

let connId = 0;
const server = net.createServer(src => {
  const id = ++connId;
  console.log(`[PROXY #${id}] Incoming connection from ${src.remoteAddress}:${src.remotePort}`);
  
  const dst = net.connect(5433, '::1', () => {
    console.log(`[PROXY #${id}] Connected to ::1:5433`);
  });
  
  src.pipe(dst);
  dst.pipe(src);
  
  src.on('data', d => console.log(`[PROXY #${id}] src -> dst: ${d.length} bytes`));
  dst.on('data', d => console.log(`[PROXY #${id}] dst -> src: ${d.length} bytes`));
  
  src.on('error', e => console.log(`[PROXY #${id}] src error: ${e.message}`));
  dst.on('error', e => console.log(`[PROXY #${id}] dst error: ${e.message}`));
  
  src.on('close', () => {
    console.log(`[PROXY #${id}] src closed`);
    dst.destroy();
  });
  dst.on('close', () => {
    console.log(`[PROXY #${id}] dst closed`);
    src.destroy();
  });
});

server.listen(5433, '127.0.0.1', () => {
  console.log('[DB-PROXY] Verbose proxy listening on 127.0.0.1:5433 -> [::1]:5433');
});
