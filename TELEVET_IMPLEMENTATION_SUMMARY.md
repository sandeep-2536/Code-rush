# TeleVet Video Call System - Complete Implementation Summary

## Overview
The TeleVet system enables real-time video calling between farmers and veterinarians using WebRTC peer-to-peer connections coordinated through Socket.IO signaling.

## Call Flow Architecture

### 1. **Initiation Phase**
- **Route**: `/teleVet/farmer/call/:vetId` (Farmer)
- **Controller**: `teleVetRoutes.js` line 21
- **View**: `farmerCall.ejs`
  - Passes: `farmer._id`, `farmer.name`, `vet._id`, `vet.name` via `#teleVetConfig` data element
  - Includes: `teleVetFarmerCall.js` client script

### 2. **Socket Registration**
- **File**: `teleVetFarmerCall.js` & `teleVetVetDashboard.js`
- **Event**: `socket.emit("register", userId)`
- **Handler in app.js**: Lines 127-135
  - Stores mapping: `userSocketMap[userId] = socket.id`
  - Logs: `[socket] registered user <userId> -> <socketId>`
- **Guard**: Checks `socket.connected` before emitting, or waits for 'connect' event

### 3. **Call Initiation (Farmer → Server)**
- **File**: `teleVetFarmerCall.js` line 95
- **Event**: `socket.emit("callUser", { toUserId, roomId, fromUserId, fromName })`
  - `toUserId`: Vet's ID
  - `roomId`: Generated as `vetroom_<timestamp>_<random>`
  - `fromUserId`: Farmer's ID
  - `fromName`: Farmer's name

### 4. **Server Relay - Incoming Call Notification**
- **Handler in app.js**: Lines 138-149
- **Event**: `socket.on('callUser')`
  - Looks up vet's socket: `userSocketMap[toUserId]`
  - Emits to vet: `incomingCall({ fromUserId, fromName, roomId })`
  - If vet offline: Sends `noAnswer` to farmer

### 5. **Vet Dashboard - Incoming Call Display**
- **File**: `teleVetVetDashboard.js`
- **Event Listener**: `socket.on("incomingCall", ...)`
- **Action**: 
  - Stores `currentCallerId` and `currentRoomId`
  - Shows incoming call modal with farmer name
  - User clicks "Accept" or "Reject" button

### 6. **Vet Accepts Call**
- **File**: `teleVetVetDashboard.js` line 55
- **Event**: `socket.emit("acceptCall", { callerUserId, roomId })`
- **Next Action**: Redirects to `/teleVet/doctor/call?roomId=X&farmerId=Y`

### 7. **Server Processes Acceptance - CRITICAL STEP**
- **Handler in app.js**: Lines 152-163 (UPDATED WITH ROOM JOIN)
- **Event**: `socket.on('acceptCall')`
- **Key Actions** (IN ORDER):
  1. `socket.join(roomId)` — Vet joins Socket.IO room
  2. Look up farmer's socket: `userSocketMap[callerUserId]`
  3. Emit to farmer: `callAccepted({ roomId })`
  - **Logs**: `[socket] vet socket joined room <roomId>`
  - **Logs**: `[socket] sent callAccepted to farmer <callerUserId>`

### 8. **Farmer Receives Acceptance**
- **File**: `teleVetFarmerCall.js` line 99
- **Event Listener**: `socket.on("callAccepted", ...)`
- **Action**: `socket.emit("joinRoom", roomId)`
- **Status Update**: "Doctor accepted. Connecting video..."

### 9. **Farmer Joins Room**
- **Handler in app.js**: Lines 166-176
- **Event**: `socket.on("joinRoom", (roomId))`
- **Actions**:
  1. `socket.join(roomId)` — Farmer joins Socket.IO room
  2. Gets room members
  3. Emits to room: `ready` event
  - **Logs**: `[socket] joinRoom { roomId, socketId, members }`
  - **Logs**: `[socket] ready emitted to room <roomId>`

### 10. **Vet Joins Room (After Page Load)**
- **Route**: `/teleVet/doctor/call?roomId=X&farmerId=Y` (Vet)
- **View**: `doctorCall.ejs`
  - Receives: `vet._id`, `vet.name`, `roomId`, `farmer._id`, `farmer.name` via `#teleVetConfig`
  - Includes: `teleVetDoctorCall.js` client script
- **File**: `teleVetDoctorCall.js` line 68
- **Event**: `socket.emit("joinRoom", roomId)`
- **Result**: Vet joins room, other member (farmer) receives `ready` event

### 11. **WebRTC Signaling - Ready Event**
- **Handler in app.js**: Lines 166-176
- **Event**: When room member joins, emits `ready` to others in room
- **Files Listening**:
  - `teleVetFarmerCall.js` line 101 — Farmer receives, creates offer
  - `teleVetDoctorCall.js` line 100 — Vet also has ready handler

### 12. **WebRTC Offer Creation**
- **File**: `teleVetFarmerCall.js` line 101 (or first to join)
- **Event Listener**: `socket.on("ready")`
- **Actions**:
  1. Create RTCPeerConnection with STUN servers
  2. Add local media tracks
  3. Create WebRTC offer: `pc.createOffer()`
  4. Set local description: `pc.setLocalDescription(offer)`
  5. Emit: `socket.emit("offer", { roomId, offer })`

### 13. **Offer Relay to Room**
- **Handler in app.js**: Lines 179-182
- **Event**: `socket.on("offer")`
- **Action**: `socket.to(roomId).emit("offer", offer)`
- **Result**: Offer sent to other member in room

### 14. **WebRTC Answer Creation**
- **File**: `teleVetFarmerCall.js` or `teleVetDoctorCall.js` (receiver)
- **Event Listener**: `socket.on("offer", (offer))`
- **Actions**:
  1. Set remote description from offer
  2. Create WebRTC answer: `pc.createAnswer()`
  3. Set local description: `pc.setLocalDescription(answer)`
  4. Emit: `socket.emit("answer", { roomId, answer })`

### 15. **Answer Relay**
- **Handler in app.js**: Lines 185-188
- **Event**: `socket.on("answer")`
- **Action**: `socket.to(roomId).emit("answer", answer)`

### 16. **Answer Processing**
- **Event Listener**: Both files listen for `answer`
- **Action**: Set remote description from answer
- **Result**: WebRTC connection established

### 17. **ICE Candidates Exchange**
- **Handler in app.js**: Lines 191-195
- **Event**: `socket.on("iceCandidate")`
- **Action**: `socket.to(roomId).emit("iceCandidate", { candidate })`
- **Result**: Continues until connection fully established

### 18. **Video Display**
- **Event**: RTCPeerConnection `ontrack` event
- **Action**: Set remote video stream: `remoteVideo.srcObject = stream`
- **Status Update**: "Connected ✓"

## Key Data Structures

### User-Socket Mapping (Server-side)
```javascript
userSocketMap = {
  "<userId>": "<socketId>",
  "<vetId>": "<socketId>"
}
```

### Room Naming Convention
- Format: `vetroom_<timestamp>_<randomNumber>`
- Example: `vetroom_1704067200000_4567`
- Generated by: `teleVetFarmerCall.js` line 19

### Configuration Data Flow
1. **Backend → Frontend**: Express passes user data to EJS views
2. **EJS → HTML**: Embeds data in `#teleVetConfig` element with `data-*` attributes
3. **HTML → JavaScript**: Client script reads via `document.getElementById('teleVetConfig').dataset`
4. **JavaScript → Window**: Stores in window globals (e.g., `window.CURRENT_VET`)

## Files Modified

### Backend
- ✅ `app.js` - Socket handlers with room joining logic
- ✅ `routes/teleVetRoutes.js` - Routes for farmer/doctor/vet pages

### Frontend - JavaScript
- ✅ `public/js/teleVetFarmerCall.js` - Farmer initiates call, handles WebRTC
- ✅ `public/js/teleVetVetDashboard.js` - Vet dashboard, accepts/rejects calls
- ✅ `public/js/teleVetDoctorCall.js` - Vet's video call page

### Frontend - HTML/EJS
- ✅ `views/layouts/footer.ejs` - Embeds user/vet data via HTML elements
- ✅ `views/teleVet/farmerCall.ejs` - Exports config data element
- ✅ `views/teleVet/doctorCall.ejs` - Exports config data element
- ✅ `views/teleVet/vetDashboard.ejs` - Dashboard UI

## Critical Implementation Details

### 1. Room Joining Order (MUST BE STRICT)
```
✅ CORRECT:
  1. acceptCall handler: socket.join(roomId)
  2. acceptCall handler: emit callAccepted
  3. farmer receives callAccepted: emit joinRoom
  4. farmer joins room
  5. room members get "ready" event
  
❌ WRONG (Previous bug):
  1. acceptCall emits callAccepted (vet not in room yet!)
  2. farmer joins room
  3. Both now in room but timing might cause misses
```

### 2. Socket Connection Guard
```javascript
// Correct pattern used in all client files:
if (socket.connected) {
  socket.emit("register", userId);
} else {
  socket.on('connect', () => {
    socket.emit("register", userId);
  });
}
```

### 3. Data Access Pattern
```javascript
// CORRECT: Read from DOM via footer.ejs
window.CURRENT_VET = {
  _id: vetId,
  name: vetName
};

// CORRECT: Read via dataset in #teleVetConfig
const cfg = document.getElementById('teleVetConfig').dataset;
const farmerId = cfg.farmerId;
```

## Logging & Debugging

### Console Logs for Verification
All socket events are logged with `[socket]` prefix:
- `[socket] registered user <id> -> <socketId>`
- `[socket] callUser event: { toUserId, roomId, ... }`
- `[socket] target vet found, sending incomingCall`
- `[socket] acceptCall event: { callerUserId, roomId }`
- `[socket] vet socket joined room: <roomId>`
- `[socket] sent callAccepted to farmer: <userId>`
- `[socket] joinRoom { roomId, socketId, members }`
- `[socket] ready emitted to room: <roomId>`

### Debugging Endpoint
- **URL**: `GET /debug/sockets`
- **Returns**: Current userSocketMap with all active users and their socket IDs
- **Use**: Verify users are registered

## Testing Steps

### Scenario 1: Successful Call Flow
1. **Setup**:
   - Open browser 1: Navigate to `/teleVet` as Farmer
   - Open browser 2: Navigate to `/teleVet/doctor/dashboard` as Vet
   - Check console logs for registration

2. **Farmer Initiates**:
   - Click "Start Video Call" on a vet
   - Should see "Calling doctor..." status
   - Check farmer socket ID registered

3. **Vet Receives**:
   - Should see "Incoming call from [Farmer]" modal
   - Check console: `[socket] incomingCall received`

4. **Vet Accepts**:
   - Click "Accept" button
   - Check console: `[socket] vet socket joined room`
   - Page redirects to doctor call page

5. **Farmer Receives Acceptance**:
   - Status updates to "Doctor accepted. Connecting video..."
   - Farmer joins room
   - Both should see "Connected ✓"

### Scenario 2: Vet Offline
1. Farmer initiates call to offline vet
2. Should see "Doctor is not available" message
3. Check console: `[socket] callUser - vet not found`

### Scenario 3: Call Rejection
1. Vet receives call, clicks "Reject"
2. Farmer should see "Doctor rejected the call"
3. Room should be cleaned up

## Performance Considerations

### Room Cleanup
- Socket.IO automatically removes socket from rooms on disconnect
- Cleanup handler in app.js line 211 removes user from `userSocketMap`

### ICE Gathering
- Google STUN servers used for NAT traversal
- Candidates collected and sent as they become available
- Connection works even in restricted networks (via STUN)

### Media Constraints
```javascript
video: { width: { ideal: 1280 }, height: { ideal: 720 } },
audio: true
```
- Adaptive to available bandwidth
- Falls back to lower quality if needed

## Error Handling

### User Not Logged In
- Redirects to `/auth/login` (farmer) or `/vet-auth/login` (vet)
- Checked in routes before rendering

### Vet Not Found
- Route returns 404: `Vet not found`
- Farmer sees error page

### Farmer Not Found (in doctor call page)
- Route returns 404: `Farmer not found`
- Doctor sees error page

### Missing Permissions
- Browser permission denied for camera/mic
- Shown: "Camera/mic permission denied"
- Instruction: "Please allow camera and microphone access and reload"

### Invalid Room ID
- Checked with regex: `roomId.includes('vetroom_')`
- Returns 400: `Invalid room ID`

## Configuration & Constants

### Socket.IO
- **Version**: Included via CDN in header: `/socket.io/socket.io.js`
- **Namespace**: Default (`/`)
- **Rooms**: Ad-hoc rooms created per call (not persistent)

### STUN Servers
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`
- Provides IP candidates for NAT-restricted networks

### Timeouts
- Peer connection timeout: Browser default (~30s)
- Call status updates: Immediate
- Redirect on cleanup: 1.5s delay

## Future Enhancements

Potential improvements not yet implemented:
1. TURN server for relay (if STUN doesn't work)
2. Call history storage
3. Call recording
4. Video quality monitoring
5. End-to-end encryption
6. Chat during call
7. Screen sharing
8. Multiple simultaneous calls

---

**Status**: ✅ COMPLETE - All components implemented and integrated
**Last Updated**: 2024
**Testing**: Ready for manual verification
