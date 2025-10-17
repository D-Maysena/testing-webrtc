import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

// ✅ Cambia la URL según dónde tengas tu backend
const socket = io("https://sinaes.up.railway.app", {
  transports: ["websocket"], // evita errores de transporte
});

export default function VideoCall({ roomId }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        console.log("🎥 Solicitando acceso a cámara y micrófono...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        localVideoRef.current.srcObject = stream;
        localStreamRef.current = stream;

        // 🔹 En móviles, forzar la reproducción manual
        await localVideoRef.current.play().catch(() => {
          console.warn("Esperando interacción del usuario para reproducir video local...");
        });

        // 🌍 Configuración STUN + TURN (para redes móviles)
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
              urls: [
                "stun:openrelay.metered.ca:80",
                "turn:openrelay.metered.ca:80",
                "turn:openrelay.metered.ca:443",
                "turn:openrelay.metered.ca:443?transport=tcp",
              ],
              username: "openrelayproject",
              credential: "openrelayproject",
            },
          ],
        });
        pcRef.current = pc;

        // 🔹 Agregar tracks locales
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // 🔹 Recibir tracks remotos
        pc.ontrack = (event) => {
          console.log("📡 Recibiendo video remoto...");
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.play().catch(() => {
            console.warn("Esperando interacción del usuario para reproducir video remoto...");
          });
        };

        // 🔹 Enviar candidatos locales
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("ice-candidate", { roomId, candidate: event.candidate });
          }
        };

        // 🔹 Estado de conexión (útil para depurar)
        pc.onconnectionstatechange = () => {
          console.log("🔗 Estado de conexión:", pc.connectionState);
          if (pc.connectionState === "connected") {
            setConnected(true);
          }
        };

        // 🚪 Unirse a la sala
        socket.emit("join-room", { roomId });

        // Cuando otro usuario entra, avisar para crear offer
        socket.on("ready", async () => {
          console.log("✅ Otro usuario se unió, creando offer...");
          setReady(true);
          await startCall();
        });

        // 📩 Recibir offer
        socket.on("offer", async ({ offer }) => {
          console.log("📩 Offer recibida");
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { roomId, answer });
        });

        // 📩 Recibir answer
        socket.on("answer", async ({ answer }) => {
          console.log("📩 Answer recibida");
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        });

        // ❄️ Recibir ICE candidate remoto
        socket.on("ice-candidate", async ({ candidate }) => {
          if (!candidate) return;
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("⚠️ Error agregando ICE candidate:", err);
          }
        });
      } catch (err) {
        console.error("❌ Error accediendo a cámara/micrófono:", err);
        alert("No se pudo acceder a la cámara o micrófono. Revisa permisos.");
      }
    };

    init();

    // 🧹 Cleanup
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

    console.log("📞 Creando offer...");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", { roomId, offer });
  };

  // 🔇 Finalizar llamada
  const endCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (pcRef.current) pcRef.current.close();
    socket.disconnect();
    window.location.reload();
  };

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <h2>Videollamada en sala: {roomId}</h2>

      <div style={{ display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap" }}>
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          controls // iOS requiere control visible para permisos
          style={{ width: "300px", borderRadius: "10px", border: "2px solid #ccc" }}
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          controls
          style={{ width: "300px", borderRadius: "10px", border: "2px solid #ccc" }}
        />
      </div>

      {!ready && (
        <button onClick={startCall} style={{ marginTop: "20px" }}>
          📞 Iniciar llamada
        </button>
      )}
      {connected && (
        <button
          onClick={endCall}
          style={{
            marginTop: "20px",
            marginLeft: "10px",
            background: "#e63946",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: "8px",
          }}
        >
          ❌ Finalizar llamada
        </button>
      )}
    </div>
  );
}
