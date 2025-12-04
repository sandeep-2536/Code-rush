# TeleVet Quick Testing Guide

## 🎯 Quick Setup for Testing

### Prerequisites
- Node.js server running (port 3000 or specified in .env)
- MongoDB connected
- Two browsers or browser windows open

## 📋 Step-by-Step Test Scenario

### Step 1: Login as Vet
1. Open Browser 1
2. Go to: `http://localhost:3000/vet-auth/login`
3. Login with vet credentials
4. Navigate to: `http://localhost:3000/teleVet/doctor/dashboard`
5. **Check Console**: Should see `[teleVetVetDashboard] registered vet: <vetId>`
6. **Keep this window open**

### Step 2: Login as Farmer
1. Open Browser 2 (or new tab in same browser)
2. Go to: `http://localhost:3000/auth/login`
3. Login with farmer credentials
4. Navigate to: `http://localhost:3000/teleVet`
5. You should see list of available vets
6. **Click "Start Video Call"** on a vet
7. **Check Console**: Should see `[teleVetFarmerCall] registered farmer: <farmerId>`

### Step 3: Farmer Initiates Call
- Farmer page shows: "Calling doctor..."
- **Browser 1 (Vet Dashboard)**: Should show incoming call modal with farmer's name
- **Browser 1 Console**: Should show `[teleVetVetDashboard] incomingCall received: { fromUserId, fromName, roomId }`

### Step 4: Vet Accepts Call
- Click **"Accept"** button in incoming call modal
- **Vet redirects** to: `http://localhost:3000/teleVet/doctor/call?roomId=<X>&farmerId=<Y>`
- **Browser 1 Console**: Should see `[socket] vet socket joined room: <roomId>`
- **Browser 2 (Farmer)**: Status changes to "Doctor accepted. Connecting video..."
- **Browser 2 Console**: Should see `[teleVetFarmerCall] call accepted`

### Step 5: WebRTC Connection Establishes
- Both browsers request camera/microphone permissions (if first time)
- **Allow permissions** in both browsers
- Should see local video in both windows within 2-3 seconds
- After full connection: Status shows "Connected ✓"
- Remote video appears in both windows

### Step 6: Verify Two-Way Video
- **Browser 1 (Vet)**: Should see farmer's video
- **Browser 2 (Farmer)**: Should see vet's video
- Try **muting audio/disabling camera** - should toggle text on button
- **Both browsers Console**: Check for `[socket]` relay logs

### Step 7: End Call
- Click **"End Call"** button in either browser
- Pages redirect back after 1.5 seconds
- **Console**: Should show `[socket] call ended`

---

## 🐛 Troubleshooting Guide

### Issue: Vet doesn't see incoming call modal

**Checks**:
1. Verify vet registered: Check `/debug/sockets` endpoint
   - Should show: `{ "<vetId>": "<socketId>" }`
   
2. Check Console (Vet dashboard):
   - Should see: `[teleVetVetDashboard] registered vet: <vetId>`
   - Should see: `[socket] callUser event:` in browser console logs

3. Verify Socket.IO connected:
   - Console should show `socket.io.js` loaded
   - No 404 errors for `/socket.io/socket.io.js`

**Solution**:
- Refresh vet dashboard page
- Check if vet is actually logged in (check session)
- Check backend logs for socket connection errors

---

### Issue: Farmer sees "Doctor is not available"

**Checks**:
1. Verify vet socket registered: `/debug/sockets`
   
2. Check farmer console:
   - Should see: `[socket] callUser - vet not found`
   
3. Verify vet is on dashboard:
   - Vet should be actively on `/teleVet/doctor/dashboard`
   - Not on another page

**Solution**:
- Make sure vet is on the dashboard page
- Try refreshing vet dashboard
- Check if vet socket dropped (network issue?)

---

### Issue: Call accepted but no video appears

**Checks**:
1. Check for permission prompts:
   - Browser should ask for camera/mic permission
   - Must click "Allow" in both browsers
   
2. Check console for WebRTC errors:
   - Look for `addIceCandidate error` messages
   - Check for `ERR_WEBRTC_INVALID_DESCRIPTION` errors
   
3. Verify room join happened:
   - Console should show: `[socket] joinRoom { roomId, socketId }`
   - Console should show: `[socket] ready emitted to room`

4. Check RTCPeerConnection state:
   - Console should show: `[teleVet*] connection state: connected`
   - Should see: `[teleVet*] ontrack event:`

**Solution**:
- Verify browser permissions are set for camera/mic
- Check if WebRTC is blocked by corporate firewall/proxy
- Try different STUN servers if needed
- Check network connectivity (ping, tracert)

---

### Issue: Video is one-way (only farmer sees vet or vice versa)

**Checks**:
1. Check if both createOffer/createAnswer ran:
   - Console should show `creating peer connection` in both
   - Console should show `offer sent` and `answer set`

2. Check if answer was processed:
   - Console should show: `[teleVet*] answer received` or `answer set`

3. Verify ICE candidates exchanged:
   - Console should show: `[socket] forwarding iceCandidate to room`

**Solution**:
- One browser didn't receive the "ready" event
- Try: End call, refresh one page, call again
- Check if one peer is behind strict NAT/firewall

---

### Issue: "io is not defined" error in console

**Checks**:
1. Verify socket.io library loaded:
   - Check Network tab in DevTools
   - Should see: `/socket.io/socket.io.js` (200 OK)

2. Check script loading order:
   - socket.io script should be in `<head>` or before client script
   - Check `footer.ejs` includes it

**Solution**:
- Refresh page (hard refresh: Ctrl+Shift+R)
- Clear browser cache
- Check if CDN is blocked

---

### Issue: "ReferenceError: teleVetConfig is undefined"

**Checks**:
1. Verify #teleVetConfig element exists:
   - In browser DevTools: `document.getElementById('teleVetConfig')`
   - Should return the HTML element (not null)

2. Check data attributes populated:
   - `element.dataset.farmerId` should have value
   - `element.dataset.vetId` should have value

3. Verify EJS variables passed:
   - Route should pass `farmer` and `vet` objects
   - Check Express response in network tab

**Solution**:
- Check route handler passes correct variables
- Verify EJS rendering (view page source)
- Ensure logged-in user matches expected role

---

## 📊 Console Output Reference

### Expected sequence in console (Farmer):
```
[teleVetFarmerCall] initialized: { farmerId, vetId, roomId, farmerName, vetName }
[teleVetFarmerCall] registered farmer after connect: <farmerId>
[teleVetFarmerCall] requesting media
[teleVetFarmerCall] media obtained
[teleVetFarmerCall] creating peer connection
[teleVetFarmerCall] added track: video
[teleVetFarmerCall] added track: audio
[teleVetFarmerCall] call initiated
[socket] forwarding iceCandidate to room
[teleVetFarmerCall] call accepted
[teleVetFarmerCall] doctor ready, creating offer
[teleVetFarmerCall] offer sent
[teleVetFarmerCall] answer received
[teleVetFarmerCall] answer set
[teleVetFarmerCall] connection state: connected
[teleVetFarmerCall] ontrack event: 1 (remote video stream received)
```

### Expected sequence in console (Vet Dashboard):
```
[teleVetVetDashboard] initialized: { vetId, vetName }
[teleVetVetDashboard] registered vet after connect: <vetId>
[teleVetVetDashboard] incomingCall received: { fromUserId, fromName, roomId }
[teleVetVetDashboard] accept clicked: { currentCallerId, currentRoomId }
```

### Expected sequence in console (Server - app.js):
```
[socket] registered user <farmerId> -> <socketId1>
[socket] registered user <vetId> -> <socketId2>
[socket] callUser event: { toUserId, roomId, fromUserId, fromName }
[socket] target vet found, sending incomingCall to: <vetId>
[socket] acceptCall event: { callerUserId, roomId }
[socket] vet socket joined room: <roomId>
[socket] sent callAccepted to farmer: <farmerId>
[socket] joinRoom { roomId, socketId: <socketId1>, members: [<socketId1>, <socketId2>] }
[socket] ready emitted to room <roomId>
[socket] forwarding offer to room <roomId>
[socket] forwarding answer to room <roomId>
[socket] forwarding iceCandidate to room <roomId>
```

---

## 🔍 Quick Debug Commands

### Check registered users in browser console:
```javascript
fetch('/debug/sockets').then(r => r.json()).then(console.log)
```

### Manually trigger socket events (advanced):
```javascript
socket.emit("test", { data: "value" });
socket.on("test", (data) => console.log(data));
```

### Check if socket connected:
```javascript
console.log("Socket connected:", socket.connected);
console.log("Socket ID:", socket.id);
```

### Check room members:
```javascript
// This won't show in browser, but check server logs
// Server shows room members when someone joins
```

---

## ✅ Success Criteria

Call is **WORKING** if:
- ✅ Vet receives incoming call modal with farmer name
- ✅ Farmer sees "Doctor accepted" status after vet accepts
- ✅ Both see "Connected ✓" after WebRTC establishes
- ✅ Both can see each other's video
- ✅ Audio works (test by speaking)
- ✅ Mute/Camera controls toggle
- ✅ Either can end call and redirect properly
- ✅ No JavaScript errors in console

---

## 📞 Support

If tests fail:
1. **Check all console logs** - they tell you exactly what happened
2. **Use `/debug/sockets`** - verify users are registered
3. **Check Network tab** - verify socket.io.js loaded
4. **Check server logs** - verify socket events reached server
5. **Try different browser** - rule out browser-specific issues
6. **Check firewall** - WebRTC might be blocked

---

**Happy Testing!** 🎉
