const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

// === ARCHIVOS ESTÁTICOS ===
// Como tus archivos (index.html, room.html, styles.css, client.js)
// están en la raíz del proyecto, usamos __dirname directamente.
const publicPath = __dirname;
app.use(express.static(publicPath));

// Ruta principal: sirve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// === LÓGICA DE SEÑALIZACIÓN WEBRTC CON SOCKET.IO ===
io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado', socket.id);

  socket.on('join-room', (roomId, role) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = role;
    console.log(`Socket ${socket.id} se unió a la sala ${roomId} como ${role}`);
    socket.to(roomId).emit('user-joined', { id: socket.id, role });
  });

  socket.on('offer', ({ roomId, sdp }) => {
    socket.to(roomId).emit('offer', { sdp, from: socket.id });
  });

  socket.on('answer', ({ roomId, sdp }) => {
    socket.to(roomId).emit('answer', { sdp, from: socket.id });
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      socket.to(roomId).emit('user-left', { id: socket.id });
    }
    console.log('Cliente desconectado', socket.id);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log('Servidor escuchando en puerto', PORT);
});
