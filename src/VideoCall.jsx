import React, { useEffect, useRef } from "react";
import io from "socket.io-client";

const socket = io("https://sinaes.up.railway.app");

export default function VideoCall({ roomId }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

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
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          remoteVideoRef.current.srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("ice-candidate", {
              roomId,
              candidate: event.candidate,
            });
          }
        };

        // Unirse a la sala
        socket.emit("join-room", { roomId });

        // Manejar offer recibida
        socket.on("offer", async ({ offer }) => {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("answer", { roomId, answer });
        });

        // Manejar answer recibida
        socket.on("answer", async ({ answer }) => {
          if (answer && answer.type && answer.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        });

        // Manejar ICE candidates remotos
        socket.on("ice-candidate", async ({ candidate }) => {
          try {
            if (candidate && candidate.candidate) {
              // WebRTC espera un objeto con .candidate
              await pcRef.current.addIceCandidate(
                new RTCIceCandidate(candidate)
              );
            }
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

  const startCall = async () => {
    if (!pcRef.current) return;
    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    socket.emit("offer", {
      roomId,
      offer: { type: offer.type, sdp: offer.sdp },
    });
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
