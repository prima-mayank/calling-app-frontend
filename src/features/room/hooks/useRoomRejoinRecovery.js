import { useEffect, useMemo } from "react";
import { isPeerReadyForCalls } from "../../../utils/peerCallUtils";

const normalizePeerId = (value) => String(value || "").trim();

export const useRoomRejoinRecovery = ({
  socket,
  roomId,
  user,
  hasJoined,
  roomParticipants,
  retryIntervalMs = 2500,
}) => {
  const normalizedRoomId = String(roomId || "").trim();
  const normalizedPeerId = normalizePeerId(user?.id);

  const isMemberInRoom = useMemo(() => {
    if (!normalizedPeerId) return false;
    return roomParticipants.some(
      (participantId) => normalizePeerId(participantId) === normalizedPeerId
    );
  }, [normalizedPeerId, roomParticipants]);

  useEffect(() => {
    if (!normalizedRoomId || !normalizedPeerId) return;

    const intervalMs = Number.isFinite(Number(retryIntervalMs))
      ? Math.max(1200, Math.floor(Number(retryIntervalMs)))
      : 2500;

    let disposed = false;
    const peerReady = () => hasJoined && isPeerReadyForCalls(user);

    const emitJoinAndReady = () => {
      if (disposed) return;
      if (!socket.connected) return;

      socket.emit("joined-room", {
        roomId: normalizedRoomId,
        peerId: normalizedPeerId,
      });

      if (peerReady()) {
        socket.emit("ready");
      }
    };

    const onSocketConnect = () => {
      emitJoinAndReady();
    };

    socket.on("connect", onSocketConnect);

    if (socket.connected) {
      emitJoinAndReady();
    }

    const intervalId = window.setInterval(() => {
      if (disposed || !socket.connected) return;

      const membershipSettled = isMemberInRoom && (!hasJoined || peerReady());
      if (membershipSettled) return;

      emitJoinAndReady();
    }, intervalMs);

    return () => {
      disposed = true;
      socket.off("connect", onSocketConnect);
      window.clearInterval(intervalId);
    };
  }, [
    hasJoined,
    isMemberInRoom,
    normalizedPeerId,
    normalizedRoomId,
    retryIntervalMs,
    socket,
    user,
  ]);
};
