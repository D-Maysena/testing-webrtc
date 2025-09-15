import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:8080");

export default function VideoCall({ roomId }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [pc, setPc] = useState(null);
  const [localStream, setLocalStream] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        // ✅ Pedir permisos de cámara/micrófono
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        setLocalStream(stream);
        localVideoRef.current.srcObject = stream;

        const peerConnection = new RTCPeerConnection();

        // ✅ Agregar tracks locales a la conexión
        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });

        // ✅ Cuando llegue un track remoto, mostrarlo
        peerConnection.ontrack = (event) => {
          remoteVideoRef.current.srcObject = event.streams[0];
        };

        setPc(peerConnection);

        // ✅ Unirse a la sala
        socket.emit("join-room", roomId);

        // ✅ Mensajes de señalización
        socket.on("offer", async (offer) => {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(offer)
          );
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.emit("answer", answer, roomId);
        });

        socket.on("answer", async (answer) => {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
        });

        socket.on("ice-candidate", async (candidate) => {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("Error agregando ICE", err);
          }
        });

        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("ice-candidate", event.candidate, roomId);
          }
        };
      } catch (err) {
        console.error("❌ Error iniciando cámara/micrófono:", err);
        alert("No se pudo acceder a cámara o micrófono. Revisa permisos.");
      }
    };

    init();

    return () => {
      // ✅ Limpiar al salir
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      socket.off();
    };
  }, [roomId]);

  const startCall = async () => {
    if (!pc) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", offer, roomId);
  };

  return (
    <div>
      <h2>Llamada en sala: {roomId}</h2>
      <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "300px" }} />
      <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "300px" }} />
      <br />
      <button onClick={startCall}>📞 Iniciar llamada</button>
    </div>
  );
}
