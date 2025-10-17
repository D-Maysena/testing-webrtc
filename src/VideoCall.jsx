import React, { useEffect, useRef } from "react";
import io from "socket.io-client";

// Cambia esta URL si tu backend está en Railway
const socket = io("https://sinaes.up.railway.app", {
  transports: ["websocket"], // importante para evitar errores de conexión
});

export default function VideoCall({ roomId }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  useEffect(() => {
    const init = async () => {
      try {
        // 1️⃣ Acceso a cámara y micrófono
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localVideoRef.current.srcObject = stream;
        localStreamRef.current = stream;

        // 2️⃣ Crear conexión RTCPeerConnection
       const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:relay1.expressturn.com:3478",
      username: "efree",
      credential: "efree"
    }
  ]
});

        pcRef.current = pc;

        // 3️⃣ Agregar pistas locales
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // 4️⃣ Cuando llega video remoto
        pc.ontrack = (event) => {
          remoteVideoRef.current.srcObject = event.streams[0];
        };

        // 5️⃣ Enviar candidatos ICE locales
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("ice-candidate", { roomId, candidate: event.candidate });
          }
        };

        // 6️⃣ Unirse a la sala
        socket.emit("join-room", { roomId });

        // 7️⃣ Cuando otro usuario entra
        socket.on("ready", async () => {
          console.log("✅ Otro usuario listo, creando offer...");
          await startCall();
        });

        // 8️⃣ Recibir offer
        socket.on("offer", async ({ offer }) => {
          console.log("📩 Recibido offer");
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { roomId, answer });
        });

        // 9️⃣ Recibir answer
        socket.on("answer", async ({ answer }) => {
          console.log("📩 Recibido answer");
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        });

        // 🔟 Recibir candidatos ICE
        socket.on("ice-candidate", async ({ candidate }) => {
          if (!candidate) return;
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("Error agregando ICE candidate:", err);
          }
        });
      } catch (err) {
        console.error("❌ Error iniciando cámara/micrófono:", err);
        alert("No se pudo acceder a cámara o micrófono. Revisa permisos.");
      }
    };

    init();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (pcRef.current) pcRef.current.close();
      socket.off();
    };
  }, [roomId]);

  // 📞 Crear y enviar offer
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
    </div>
  );
}
