const params = new URLSearchParams(window.location.search);
const roomId = params.get('roomId');
const role = params.get('role') || 'fan';

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
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.error('Error al obtener la cámara/micrófono', err);
    alert('No se pudo acceder a la cámara o micrófono');
    return;
  }

  pc = new RTCPeerConnection(iceServers);

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {
    console.log('Track remoto recibido');
    remoteVideo.srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        roomId,
        candidate: event.candidate
      });
    }
  };

  socket.emit('join-room', roomId, role);
}

socket.on('user-joined', async ({ id, role: otherRole }) => {
  console.log('Otro usuario se unió', id, otherRole);
  if (role === 'creator') {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { roomId, sdp: offer });
  }
});

socket.on('offer', async ({ sdp, from }) => {
  console.log('Offer recibida de', from);
  if (role === 'fan') {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { roomId, sdp: answer });
  }
});

socket.on('answer', async ({ sdp, from }) => {
  console.log('Answer recibida de', from);
  if (role === 'creator') {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }
});

socket.on('ice-candidate', async ({ candidate, from }) => {
  console.log('ICE candidate recibida de', from);
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error('Error al agregar ICE candidate', err);
  }
});

socket.on('user-left', ({ id }) => {
  console.log('Usuario salió', id);
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(t => t.stop());
    remoteVideo.srcObject = null;
  }
});

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

init();