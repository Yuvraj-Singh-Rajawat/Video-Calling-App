import React, { useCallback, useEffect, useState, useRef } from "react";
import { useSocket } from "../context/SocketProvider";
import { useParams } from "react-router-dom";
import peer from "../service/peer";
import { MdCallEnd } from "react-icons/md";
import { FaMicrophone, FaMicrophoneSlash } from "react-icons/fa";
import { IoVideocam, IoVideocamOff } from "react-icons/io5";



const RoomPage = () => {
  const { roomId } = useParams(); // Get the room ID from the URL
  const socket = useSocket();

  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);

  // State variables to control UI flow and stream swapping
  const [callAccepted, setCallAccepted] = useState(false);
  const [streamShared, setStreamShared] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);

  // New states for mic, video and call end functionality
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoPaused, setIsVideoPaused] = useState(false);

  // Refs for video elements
  const mainVideoRef = useRef(null);
  const previewVideoRef = useRef(null);

  // Determine which stream to show in the main view and which in the preview
  const mainStream = isSwapped ? myStream : remoteStream;
  const previewStream = isSwapped ? remoteStream : myStream;

  // Update video elements with the current MediaStream
  useEffect(() => {
    if (mainVideoRef.current && mainStream) {
      mainVideoRef.current.srcObject = mainStream;
    }
  }, [mainStream]);

  useEffect(() => {
    if (previewVideoRef.current && previewStream) {
      previewVideoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  // Automatically join room on mount using roomId from URL.
  useEffect(() => {
    if (roomId) {
      // You can customize the join data (e.g. use stored user info)
      const joinData = { room: roomId, email: "guest@example.com" };
      socket.emit("room:join", joinData);
    }
  }, [roomId, socket]);

  const handleUserJoin = useCallback(({ email, id }) => {
    console.log(`User joined: ${email} with id ${id}`);
    // If a user other than me joins, set remoteSocketId.
    // This example assumes a two-user room.
    setRemoteSocketId(id);
  }, []);

  const handleCallUser = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      console.log("Audio tracks", stream.getAudioTracks());
      stream.getAudioTracks().forEach((track) =>
        console.log("Audio enabled:", track.enabled)
      );

      setMyStream(stream);
      const offer = await peer.getOffer();
      socket.emit("user:call", { to: remoteSocketId, offer });
    } catch (error) {
      console.error("Error initiating call:", error);
    }
  }, [remoteSocketId, socket]);

  const handleIncomingCall = useCallback(async ({ from, offer }) => {
    setIncomingCall({ from, offer });
  }, []);

  const acceptCall = async () => {
    try {
      const { from, offer } = incomingCall;
      setRemoteSocketId(from);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      setMyStream(stream);
      const ans = await peer.getAnswer(offer);
      socket.emit("call:accepted", { to: from, ans });
      setCallAccepted(true);
      setIncomingCall(null);
    } catch (error) {
      console.error("Error accepting call:", error);
    }
  };

  const shareMyStream = () => {
    sendStreams();
    setStreamShared(true);
  };

  const sendStreams = useCallback(() => {
    if (myStream) {
      myStream.getTracks().forEach((track) => {
        const existingSenders = peer.peer.getSenders();
        const alreadyAdded = existingSenders.some(
          (sender) => sender.track === track
        );
        if (!alreadyAdded) {
          peer.peer.addTrack(track, myStream);
        }
      });
    }
  }, [myStream]);

  const handleCallAccepted = useCallback(
    async ({ from, ans }) => {
      await peer.setLocalDescription(ans);
      setCallAccepted(true);
      sendStreams();
    },
    [sendStreams]
  );

  const handleNegoNeeded = useCallback(async () => {
    const offer = await peer.getOffer();
    socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
  }, [socket, remoteSocketId]);

  const handleNegoNeedIncoming = useCallback(
    async ({ from, offer }) => {
      const ans = await peer.getAnswer(offer);
      socket.emit("peer:nego:done", { to: from, ans });
    },
    [socket]
  );

  const handleNegoNeedFinal = useCallback(
    async ({ from, ans }) => {
      await peer.setLocalDescription(ans);
      sendStreams();
    },
    [sendStreams]
  );

  // Handle "call:ended" event from the server
  useEffect(() => {
    const handleCallEnded = ({ from }) => {
      console.log("Call ended by", from);
      if (myStream) {
        myStream.getTracks().forEach((track) => track.stop());
      }
      setMyStream(null);
      setRemoteStream(null);
      setCallAccepted(false);
      setStreamShared(false);
    };

    socket.on("call:ended", handleCallEnded);
    return () => {
      socket.off("call:ended", handleCallEnded);
    };
  }, [socket, myStream]);

  useEffect(() => {
    peer.peer.addEventListener("negotiationneeded", handleNegoNeeded);
    return () => {
      peer.peer.removeEventListener("negotiationneeded", handleNegoNeeded);
    };
  }, [handleNegoNeeded]);

  useEffect(() => {
    const trackListener = (e) => {
      const stream = e.streams[0];
      console.log("Received remote stream:", stream);
      setRemoteStream(stream);
    };
    peer.peer.addEventListener("track", trackListener);
    return () => {
      peer.peer.removeEventListener("track", trackListener);
    };
  }, []);

  useEffect(() => {
    socket.on("user:joined", handleUserJoin);
    socket.on("incoming:call", handleIncomingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("peer:nego:needed", handleNegoNeedIncoming);
    socket.on("peer:nego:final", handleNegoNeedFinal);

    return () => {
      socket.off("user:joined", handleUserJoin);
      socket.off("incoming:call", handleIncomingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("peer:nego:needed", handleNegoNeedIncoming);
      socket.off("peer:nego:final", handleNegoNeedFinal);
    };
  }, [
    socket,
    handleUserJoin,
    handleIncomingCall,
    handleCallAccepted,
    handleNegoNeedIncoming,
    handleNegoNeedFinal,
  ]);

  // Toggle swap between main and preview streams
  const toggleSwap = () => {
    setIsSwapped((prev) => !prev);
  };

  // Toggle microphone mute/unmute
  const toggleMute = () => {
    if (myStream) {
      myStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  };

  // Toggle video pause/resume
  const toggleVideo = () => {
    if (myStream) {
      myStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoPaused((prev) => !prev);
    }
  };

  // End the call: stop all tracks, reset state, and notify remote peer
  const endCall = () => {
    if (myStream) {
      myStream.getTracks().forEach((track) => track.stop());
    }
    setMyStream(null);
    setRemoteStream(null);
    setCallAccepted(false);
    setStreamShared(false);
    socket.emit("call:ended", { to: remoteSocketId });
  };

  return (
    <div className="min-h-screen bg-gray-900 relative pt-10 rounded-md
    ">
      {/* Main Video Container */}
      <div className="w-full h-full flex items-center justify-center pt-10 rounded-2xl">
        {mainStream ? (
          <video
            ref={mainVideoRef}
            autoPlay
            playsInline
            className="w-[80vw] h-[80vh] object-cover rounded-2xl border border-white"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white">
            {callAccepted ? "Waiting for stream..." : "No active stream"}
          </div>
        )}
      </div>

      {/* Preview Video in Bottom Right */}
      {(previewStream && (myStream || remoteStream)) && (
        <div
          className="absolute bottom-4 right-4 w-40 h-28 rounded overflow-hidden cursor-pointer"
          onClick={toggleSwap}
        >
          <video
            ref={previewVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover rounded-2xl border-1 border-white"
          />
        </div>
      )}

      {/* Swap Button in Bottom Left */}
      <button
        className="absolute bottom-4 left-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
        onClick={toggleSwap}
      >
        Swap Streams
      </button>

      {/* Caller UI: CALL button (only when there is another user) */}
      {remoteSocketId ? (
        !callAccepted && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
            <button
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
              onClick={handleCallUser}
            >
              CALL
            </button>
          </div>
        )
      ) : (
        // Show a waiting message if you're alone in the room.
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-white">
          Waiting for another user...
        </div>
      )}

      {/* Callee Incoming Call Modal */}
      {incomingCall && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-8 rounded shadow-lg w-80">
            <h2 className="text-2xl font-semibold mb-4">Incoming Call</h2>
            <p className="mb-6">
              Incoming call from{" "}
              <span className="font-bold">{incomingCall.from}</span>
            </p>
            <div className="flex justify-between">
              <button
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                onClick={acceptCall}
              >
                Accept
              </button>
              <button
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                onClick={() => setIncomingCall(null)}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Callee UI: "Share My Stream" button */}
      {callAccepted && !streamShared && myStream && !incomingCall && (
        <div className="absolute top-4 right-4">
          <button
            className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
            onClick={shareMyStream}
          >
            Share My Stream
          </button>
        </div>
      )}

      {/* Call Control Panel */}
      {callAccepted && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 flex gap-4">
          <button
            className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors "
            onClick={toggleMute}
          >
            {isMuted ? <FaMicrophoneSlash  className="w-8 h-8"/> : <FaMicrophone className="w-8 h-8"/>}
          </button>
          <button
            className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
            onClick={toggleVideo}
          >
            {isVideoPaused ? <IoVideocamOff  className="w-8 h-8"/> : <IoVideocam  className="w-8 h-8"/>}
          </button>
          <button
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            onClick={endCall}
          >
            <MdCallEnd className="w-8 h-8"/>
          </button>
        </div>
      )}
    </div>
  );
};

export default RoomPage;
