import React, { useEffect, useRef } from "react";
import io from "socket.io-client";

const socket = io("https://sinaes.up.railway.app");

export default function VideoCall({ roomId }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const targetRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = stream;
      localStreamRef.current = stream;

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

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.ontrack = (e) => {
        remoteVideoRef.current.srcObject = e.streams[0];
      };

      pc.onicecandidate = (e) => {
        if (e.candidate && targetRef.current) {
          socket.emit("ice-candidate", {
            roomId,
            candidate: e.candidate,
            to: targetRef.current,
          });
        }
      };

      // 1️⃣ Unirse a la sala
      socket.emit("join-room", { roomId });

      // 2️⃣ Recibir lista de usuarios en la sala
      socket.on("all-users", async (users) => {
        if (users.length > 0) {
          targetRef.current = users[0];
          console.log("Conectando con", targetRef.current);

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { roomId, offer, to: targetRef.current });
        }
      });

      // 3️⃣ Cuando alguien nuevo se une
      socket.on("user-joined", (userId) => {
        console.log("Nuevo usuario:", userId);
        targetRef.current = userId;
      });

      // 4️⃣ Recibir oferta
      socket.on("offer", async ({ from, offer }) => {
        targetRef.current = from;
        if (pc.signalingState !== "stable") {
          console.warn("Rechazando oferta porque ya hay conexión activa");
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { roomId, answer, to: from });
      });

      // 5️⃣ Recibir respuesta
      socket.on("answer", async ({ answer }) => {
        if (pc.signalingState === "stable") {
          console.warn("Ya hay conexión estable. Ignorando answer duplicada");
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      });

      // 6️⃣ Recibir ICE candidates
      socket.on("ice-candidate", async ({ candidate }) => {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error agregando ICE candidate:", err);
        }
      });
    };

    init();

    return () => {
      socket.off();
      if (pcRef.current) pcRef.current.close();
      if (localStreamRef.current)
        localStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [roomId]);

  return (
    <div style={{ textAlign: "center", marginTop: 20 }}>
      <h2>Videollamada sala {roomId}</h2>
      <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
        <video ref={localVideoRef} autoPlay muted playsInline style={{ width: 300 }} />
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: 300 }} />
      </div>
    </div>
  );
}
