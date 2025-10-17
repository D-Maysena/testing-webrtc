import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socket = io("https://sinaes.up.railway.app", {
  transports: ["websocket"],
  withCredentials: true,
  reconnectionAttempts: 5,
});

export default function VideoCall({ roomId }) {
  const [isCaller, setIsCaller] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localVideoRef.current.srcObject = stream;
        localStreamRef.current = stream;

        const pc = new RTCPeerConnection({
          iceServers: [
            {
              urls: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
              ],
            },
            {
              urls: "turn:openrelay.metered.ca:80",
              username: "openrelayproject",
              credential: "openrelayproject",
            },
          ],
        });

        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          remoteVideoRef.current.srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("ice-candidate", { roomId, candidate: event.candidate });
          }
        };

        socket.emit("join-room", { roomId });

        // Recibir si alguien más ya está en la sala
        socket.on("user-joined", (id) => {
          console.log("Otro usuario se unió:", id);
          // Si soy el primero, iniciar la oferta
          setIsCaller(true);
        });

        // Recibir offer
        socket.on("offer", async ({ offer }) => {
          console.log("📩 Recibí offer");
          const pc = pcRef.current;
          if (pc.signalingState !== "stable") return;
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { roomId, answer });
        });

        // Recibir answer
        socket.on("answer", async ({ answer }) => {
          console.log("📩 Recibí answer");
          const pc = pcRef.current;
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          } else {
            console.warn("⚠️ Se ignoró answer en estado:", pc.signalingState);
          }
        });

        // Recibir ICE candidates remotos
        socket.on("ice-candidate", async ({ candidate }) => {
          if (!candidate) return;
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("Error agregando ICE:", err);
          }
        });
      } catch (err) {
        console.error("❌ Error iniciando cámara/micrófono:", err);
        alert("No se pudo acceder a cámara o micrófono.");
      }
    };

    init();

    return () => {
      if (localStreamRef.current)
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      if (pcRef.current) pcRef.current.close();
      socket.off();
    };
  }, [roomId]);

  const startCall = async () => {
    if (!isCaller) {
      alert("Espera a que el otro usuario se una para iniciar la llamada.");
      return;
    }

    const pc = pcRef.current;
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
