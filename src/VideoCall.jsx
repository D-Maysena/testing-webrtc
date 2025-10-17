import React, { useEffect, useRef } from "react";
import io from "socket.io-client";

// Conexión a tu servidor
const socket = io("https://sinaes.up.railway.app");

export default function VideoCall({ roomId }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  useEffect(() => {
    const init = async () => {
      try {
        // 1️⃣ Pedir permisos de cámara/micrófono
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localVideoRef.current.srcObject = stream;
        localStreamRef.current = stream;

        // 2️⃣ Crear RTCPeerConnection
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        // 3️⃣ Agregar tracks locales
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // 4️⃣ Cuando llegue track remoto
        pc.ontrack = (event) => {
          remoteVideoRef.current.srcObject = event.streams[0];
        };

        // 5️⃣ Manejar ICE candidates locales
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("ice-candidate", { roomId, candidate: event.candidate });
          }
        };

        // 6️⃣ Unirse a la sala
        socket.emit("join-room", { roomId });

        // 7️⃣ Recibir offer
        socket.on("offer", async ({ offer }) => {
          const pc = pcRef.current;
          await pc.setRemoteDescription(new RTCSessionDescription(offer));

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { roomId, answer });

          // Procesar ICE candidates pendientes
          for (const c of pendingCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (err) {
              console.error("Error agregando ICE candidate pendiente:", err);
            }
          }
          pendingCandidatesRef.current = [];
        });

        // 8️⃣ Recibir answer
        socket.on("answer", async ({ answer }) => {
          const pc = pcRef.current;
          if (answer && answer.type && answer.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));

            // Procesar ICE candidates pendientes
            for (const c of pendingCandidatesRef.current) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              } catch (err) {
                console.error("Error agregando ICE candidate pendiente:", err);
              }
            }
            pendingCandidatesRef.current = [];
          }
        });

        // 9️⃣ Recibir ICE candidates remotos
        socket.on("ice-candidate", async ({ candidate }) => {
          if (!candidate || !candidate.candidate) return;
          const pc = pcRef.current;
          if (pc && pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
              console.error("Error agregando ICE candidate:", err);
            }
          } else {
            // Guardar para después
            pendingCandidatesRef.current.push(candidate);
          }
        });
      } catch (err) {
        console.error("❌ Error iniciando cámara/micrófono:", err);
        alert("No se pudo acceder a cámara o micrófono. Revisa permisos.");
      }
    };

    init();

    return () => {
      // Limpiar al salir
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
      socket.off();
    };
  }, [roomId]);

  // Iniciar llamada: crear offer
  const startCall = async () => {
    const pc = pcRef.current;
    if (!pc) return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", { roomId, offer });
  };

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <h2>Videollamada en sala: {roomId}</h2>
      <div style={{ display: "flex", justifyContent: "center", gap: "20px" }}>
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{ width: "300px", border: "1px solid #ccc" }}
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: "300px", border: "1px solid #ccc" }}
        />
      </div>
      <button onClick={startCall} style={{ marginTop: "20px" }}>
        📞 Iniciar llamada
      </button>
    </div>
  );
}
