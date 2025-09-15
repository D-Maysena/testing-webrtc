import React, { useState } from "react";
import VideoCall from "./VideoCall";

function App() {
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);

  const joinRoom = () => {
    if (roomId.trim() !== "") setJoined(true);
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      {!joined ? (
        <div>
          <h2>Unirse a la videollamada</h2>
          <input
            type="text"
            placeholder="Código de cita (roomId)"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={joinRoom} style={{ marginLeft: "10px" }}>
            Unirse
          </button>
        </div>
      ) : (
        <VideoCall roomId={roomId} />
      )}
    </div>
  );
}

export default App;
