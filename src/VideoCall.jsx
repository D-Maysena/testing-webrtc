import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io("https://sinaes.up.railway.app");

export default function VideoCall({ roomId }) {
  const [isInitiator, setIsInitiator] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  useEffect(() => {
    const init = async () => {
      try {
        // 1️⃣ Obtener cámara y micrófono
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
      username: "efunuser",
      credential: "efunpass",
    },
  ],
});

        pcRef.current = pc;

        // 3️⃣ Añadir tracks locales
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // 4️⃣ Mostrar video remoto
        pc.ontrack = (event) => {
          remoteVideoRef.current.srcObject = event.streams[0];
        };

        // 5️⃣ Enviar ICE candidates locales
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("ice-candidate", { roomId, candidate: event.candidate });
          }
        };

        // 6️⃣ Unirse a la sala
        socket.emit("join-room", { roomId });

        // 🔸 Saber si soy el iniciador
        socket.on("user-joined", () => {
          console.log("Otro usuario se unió → seré el iniciador");
          setIsInitiator(true);
        });

        // 7️⃣ Recibir OFFER
        socket.on("offer", async ({ offer }) => {
          const pc = pcRef.current;
          if (!pc) return;

          console.log("Recibiendo offer...");

          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit("answer", { roomId, answer });

          // Procesar ICE candidates pendientes
          for (const c of pendingCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (err) {
              console.error("Error agregando ICE pendiente:", err);
            }
          }
          pendingCandidatesRef.current = [];
        });

        // 8️⃣ Recibir ANSWER
        socket.on("answer", async ({ answer }) => {
          const pc = pcRef.current;
          if (!pc) return;

          console.log("Recibiendo answer...");
          await pc.setRemoteDescription(new RTCSessionDescription(answer));

          // Procesar ICE candidates pendientes
          for (const c of pendingCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (err) {
              console.error("Error agregando ICE pendiente:", err);
            }
          }
          pendingCandidatesRef.current = [];
        });

        // 9️⃣ Recibir ICE remoto
        socket.on("ice-candidate", async ({ candidate }) => {
          if (!candidate || !candidate.candidate) return;
          const pc = pcRef.current;

          if (!pc.remoteDescription) {
            console.warn("Aún no hay remoteDescription, guardando ICE...");
            pendingCandidatesRef.current.push(candidate);
            return;
          }

          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("Error agregando ICE candidate:", err);
          }
        });

        // 🔟 Limpieza al desconectar
        socket.on("peer-disconnected", () => {
          console.warn("El otro usuario se desconectó, cerrando conexión...");
          pc.close();
        });
      } catch (err) {
        console.error("❌ Error iniciando cámara/micrófono:", err);
        alert("No se pudo acceder a cámara o micrófono.");
      }
    };

    init();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
      socket.off();
    };
  }, [roomId]);

  // 🔹 Iniciar llamada solo si soy el iniciador
  const startCall = async () => {
    if (!isInitiator) {
      alert("Solo el primer usuario puede iniciar la llamada");
      return;
    }

    const pc = pcRef.current;
    if (!pc) return;

    console.log("Creando offer...");
    const offer = await pc.createOffer({ offerToReceiveVideo: true });
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
          style={{ width: "300px", border: "2px solid #007bff", borderRadius: "8px" }}
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: "300px", border: "2px solid #ccc", borderRadius: "8px" }}
        />
      </div>

      {isInitiator && (
        <button onClick={startCall} style={{ marginTop: "20px", padding: "10px 20px" }}>
          📞 Iniciar llamada
        </button>
      )}
    </div>
  );
}
