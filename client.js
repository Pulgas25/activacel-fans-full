// Lee parámetros de la URL
const params = new URLSearchParams(window.location.search);
const roomId = params.get('roomId');
const role = params.get('role') || 'fan'; // "creator" o "fan"

const roomInfoEl = document.getElementById('room-info');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const hangupBtn = document.getElementById('hangupBtn');

roomInfoEl.textContent = `Sala: ${roomId} | Rol: ${role === 'creator' ? 'Creador' : 'Fan'}`;

const socket = io();

let pc;
let localStream;

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

async function init() {
  try {
    // 1) Obtener cámara y micrófono
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    localVideo.srcObject = localStream; // SOLO aquí usamos la cámara local
  } catch (err) {
    console.error('Error al obtener la cámara/micrófono', err);
    alert('No se pudo acceder a la cámara o micrófono');
    return;
  }

  // 2) Crear RTCPeerConnection
  pc = new RTCPeerConnection(iceServers);

  // 3) Enviar nuestros tracks al peer
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  // 4) Cuando llegue video remoto, lo mostramos en remoteVideo
  pc.ontrack = (event) => {
    console.log('Track remoto recibido');
    // IMPORTANTE: Aquí NUNCA usamos localStream, sólo lo que viene en event.streams
    remoteVideo.srcObject = event.streams[0];
  };

  // 5) Enviar ICE candidates al otro peer
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        roomId,
        candidate: event.candidate
      });
    }
  };

  // 6) Unirnos a la sala con nuestro rol
  socket.emit('join-room', roomId, role);
}

// === Eventos de Socket.IO ===

// Cuando alguien más se une a la sala
socket.on('user-joined', async ({ id, role: otherRole }) => {
  console.log('Otro usuario se unió', id, otherRole, 'yo soy', role);

  // Sólo el CREATOR inicia la oferta
  if (role === 'creator') {
    console.log('Soy CREADOR, creando offer...');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { roomId, sdp: offer });
  }
});

// Cuando recibimos una offer (del creator)
socket.on('offer', async ({ sdp, from }) => {
  console.log('Offer recibida de', from, 'yo soy', role);

  // Sólo el FAN responde a la offer
  if (role === 'fan') {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { roomId, sdp: answer });
  }
});

// Cuando recibimos una answer (del fan)
socket.on('answer', async ({ sdp, from }) => {
  console.log('Answer recibida de', from, 'yo soy', role);

  // Sólo el CREATOR procesa la answer
  if (role === 'creator') {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }
});

// Cuando recibimos un ICE candidate del otro peer
socket.on('ice-candidate', async ({ candidate, from }) => {
  console.log('ICE candidate recibida de', from);
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error('Error al agregar ICE candidate', err);
  }
});

// Cuando el otro usuario se va
socket.on('user-left', ({ id }) => {
  console.log('Usuario salió', id);
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(t => t.stop());
    remoteVideo.srcObject = null;
  }
});

// Colgar llamada
hangupBtn.addEventListener('click', () => {
  if (pc) {
    pc.close();
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  socket.disconnect();
  window.location.href = '/';
});

// Iniciar todo
init();
