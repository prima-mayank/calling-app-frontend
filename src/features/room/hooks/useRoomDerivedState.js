import { useMemo } from "react";

export const useRoomDerivedState = ({
  stream,
  peers,
  roomParticipants,
  userId,
  isScreenSharing,
  remoteDesktopSession,
  remoteDesktopPendingRequest,
  incomingRemoteDesktopRequest,
  remoteDesktopError,
  hostAppInstallPrompt,
  hasRemoteDesktopFrame,
  showRemotePanel,
  remoteHosts,
  selectedRemoteHostId,
  selectedSetupPeerId,
  zoomTarget,
}) =>
  useMemo(() => {
    const hasRemoteActivity = !!(
      remoteDesktopSession ||
      remoteDesktopPendingRequest ||
      incomingRemoteDesktopRequest ||
      remoteDesktopError ||
      hostAppInstallPrompt ||
      hasRemoteDesktopFrame
    );

    const shouldShowRemotePanel = showRemotePanel || hasRemoteActivity;
    const hasVideoTrack = !!stream && stream.getVideoTracks().length > 0;

    const otherParticipants = [
      ...new Set(
        roomParticipants
          .map((participantId) => String(participantId || "").trim())
          .filter((participantId) => participantId && participantId !== userId)
      ),
    ];

    const hasExplicitHostSelection = remoteHosts.some(
      (host) => host.hostId === selectedRemoteHostId
    );
    const effectiveSelectedRemoteHostId = hasExplicitHostSelection
      ? selectedRemoteHostId
      : "";
    const selectedRemoteHost = hasExplicitHostSelection
      ? remoteHosts.find((host) => host.hostId === selectedRemoteHostId) || null
      : null;
    const selectedRemoteHostOwnership = selectedRemoteHost?.ownership || "unclaimed";

    const canClaimSelectedHost =
      !!effectiveSelectedRemoteHostId && selectedRemoteHostOwnership !== "other";
    const canRequestSelectedHost =
      !!effectiveSelectedRemoteHostId &&
      !!selectedRemoteHost &&
      !selectedRemoteHost.busy &&
      !remoteDesktopPendingRequest &&
      selectedRemoteHostOwnership === "other";

    const effectiveSetupPeerId = otherParticipants.includes(selectedSetupPeerId)
      ? selectedSetupPeerId
      : otherParticipants.length === 1
      ? otherParticipants[0]
      : "";

    const hostOwnershipTotals = remoteHosts.reduce(
      (acc, host) => {
        const ownership =
          host?.ownership === "you" || host?.ownership === "other"
            ? host.ownership
            : "unclaimed";
        acc[ownership] += 1;
        return acc;
      },
      { you: 0, other: 0, unclaimed: 0 }
    );

    const hostOwnershipSeen = { you: 0, other: 0, unclaimed: 0 };
    const hostSelectOptions = remoteHosts.map((host) => {
      const ownership =
        host?.ownership === "you" || host?.ownership === "other"
          ? host.ownership
          : "unclaimed";
      hostOwnershipSeen[ownership] += 1;

      const baseLabel =
        ownership === "you" ? "You" : ownership === "other" ? "Other" : "Unclaimed";
      const duplicateSuffix =
        hostOwnershipTotals[ownership] > 1 ? ` ${hostOwnershipSeen[ownership]}` : "";
      const busySuffix = host?.busy ? " (busy)" : "";

      return {
        value: host.hostId,
        label: `${baseLabel}${duplicateSuffix}${busySuffix}`,
      };
    });

    const setupParticipantOptions = otherParticipants.map((peerId, index) => ({
      value: peerId,
      label: otherParticipants.length === 1 ? "Other" : `Other ${index + 1}`,
    }));

    const peerIds = Object.keys(peers);
    const participantsWithoutMedia = otherParticipants.filter(
      (participantId) => !peers[participantId]
    );

    const localParticipantBase = userId ? 1 : 0;
    const participantCount = Math.max(
      localParticipantBase + peerIds.length,
      localParticipantBase + otherParticipants.length
    );

    const modeLabel = isScreenSharing
      ? "Screen Sharing"
      : !stream
      ? "Remote Only"
      : hasVideoTrack
      ? "Video Call"
      : "Audio Call";

    const videoTiles = [
      {
        id: "local",
        label: `You ${!stream ? "(No Media)" : stream && !hasVideoTrack ? "(Audio Only)" : ""}`.trim(),
        stream,
        muted: true,
        isLocal: true,
      },
      ...peerIds.map((peerId) => ({
        id: `peer:${peerId}`,
        label: peerId,
        stream: peers[peerId].stream,
        muted: false,
        isLocal: false,
      })),
    ];

    const effectiveZoomTarget =
      zoomTarget.startsWith("peer:") && !peers[zoomTarget.slice(5)] ? "" : zoomTarget;
    const activeVideoTile =
      videoTiles.find((tile) => tile.id === effectiveZoomTarget) || null;
    const isVideoSpotlightActive = !!activeVideoTile;

    return {
      shouldShowRemotePanel,
      hasVideoTrack,
      otherParticipants,
      effectiveSelectedRemoteHostId,
      selectedRemoteHost,
      selectedRemoteHostOwnership,
      canClaimSelectedHost,
      canRequestSelectedHost,
      effectiveSetupPeerId,
      hostSelectOptions,
      setupParticipantOptions,
      peerIds,
      participantsWithoutMedia,
      participantCount,
      modeLabel,
      videoTiles,
      activeVideoTile,
      isVideoSpotlightActive,
    };
  }, [
    hasRemoteDesktopFrame,
    hostAppInstallPrompt,
    incomingRemoteDesktopRequest,
    isScreenSharing,
    peers,
    remoteDesktopError,
    remoteDesktopPendingRequest,
    remoteDesktopSession,
    remoteHosts,
    roomParticipants,
    selectedRemoteHostId,
    selectedSetupPeerId,
    showRemotePanel,
    stream,
    userId,
    zoomTarget,
  ]);
