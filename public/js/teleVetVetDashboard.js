// public/js/teleVetVetDashboard.js
(function () {
  const socket = io();
  
  // Get vet ID from global window.CURRENT_VET (set in footer.ejs)
  const vetId = window.CURRENT_VET ? window.CURRENT_VET._id : null;
  const vetName = window.CURRENT_VET ? window.CURRENT_VET.name : 'Doctor';

  if (!vetId) {
    console.error('[teleVetVetDashboard] no vetId found - vet not logged in?');
    return;
  }

  const incomingBox = document.getElementById("incomingCallBox");
  const incomingText = document.getElementById("incomingText");
  const acceptBtn = document.getElementById("acceptBtn");
  const rejectBtn = document.getElementById("rejectBtn");

  // Register vet with socket
  if (socket.connected) {
    socket.emit("register", vetId);
    console.log('[teleVetVetDashboard] registered vet:', vetId);
  } else {
    socket.on('connect', () => {
      socket.emit("register", vetId);
      console.log('[teleVetVetDashboard] registered vet after connect:', vetId);
    });
  }

  let currentCallerId = null;
  let currentRoomId = null;

  socket.on("incomingCall", ({ fromUserId, fromName, roomId }) => {
    console.log('[teleVetVetDashboard] incomingCall received:', { fromUserId, fromName, roomId });
    currentCallerId = fromUserId;
    currentRoomId = roomId;

    incomingText.innerText = `Incoming call from ${fromName || "Farmer"}`;
    incomingBox.style.display = "block";
  });

  acceptBtn.addEventListener("click", () => {
    if (!currentCallerId || !currentRoomId) return;

    console.log('[teleVetVetDashboard] accept clicked:', { currentCallerId, currentRoomId });
    
    socket.emit("acceptCall", {
      callerUserId: currentCallerId,
      roomId: currentRoomId
    });

    // go to doctor call page with roomId and farmerId
    window.location.href = `/teleVet/doctor/call?roomId=${encodeURIComponent(currentRoomId)}&farmerId=${encodeURIComponent(currentCallerId)}`;
  });

  rejectBtn.addEventListener("click", () => {
    if (!currentCallerId) return;

    console.log('[teleVetVetDashboard] reject clicked:', { currentCallerId });
    socket.emit("rejectCall", { callerUserId: currentCallerId });
    incomingBox.style.display = "none";
    currentCallerId = null;
    currentRoomId = null;
  });
})();
