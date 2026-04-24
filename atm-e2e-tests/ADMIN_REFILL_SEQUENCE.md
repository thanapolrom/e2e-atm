# Admin Refill Cash Sequence

This document describes the `admin.spec.js` refill-cash flow at two levels:

- High-level end-to-end flow across the test, app, proxy, and mock server
- Low-level proxy state transitions used to simulate banknote insertion

## Related Files

- `test/specs/admin.spec.js`
- `test/pageobjects/admin/login.page.js`
- `test/pageobjects/admin/currentcash.page.js`
- `test/pageobjects/main.page.js`
- `test/pageobjects/base.page.js`
- `proxy-itl.js`
- `mock-itl-server.js`

## High-Level Sequence

```mermaid
sequenceDiagram
    autonumber
    actor T as WDIO Test
    participant App as Mobile App
    participant Web as Keycloak WebView
    participant Proxy as ITL Proxy :5002
    participant Mock as Mock ITL Server :5001

    T->>App: Wait for main menu
    T->>App: Tap admin icon 5 times
    App-->>T: Open admin login screen

    T->>Web: Fill username and password
    T->>Web: Click Login
    Web-->>App: Login success
    App-->>T: Enter maServiceSelection screen

    T->>App: Open Current Cash
    T->>App: Tap Refill Cash

    opt Warning dialog exists
        T->>App: Confirm and continue
    end

    T->>App: Tap Start Cash Refill
    App-->>T: Show banknote input screen

    T->>Proxy: POST /test/reset
    Note over T,Proxy: Set queue = 500 THB x3, 100 THB x2

    loop App polls the cash device status
        App->>Proxy: GET GetDeviceStatus
        alt Request is GetDeviceStatus
            Proxy-->>App: Fake ACCEPTING / ESCROW / STORED states
        else Any other ITL endpoint
            Proxy->>Mock: Forward request
            Mock-->>Proxy: Mock response
            Proxy-->>App: Forwarded response
        end
    end

    loop Test waits until all notes are stored
        T->>Proxy: GET /test/status
        Proxy-->>T: { done: false/true }
        T->>App: Check Confirm button enabled
    end

    T->>App: Click Confirm
    App-->>T: Show total confirmation dialog

    T->>App: Wait 7 seconds
    T->>App: Confirm in dialog

    App-->>T: Show refill summary screen
    T->>App: Click Done
```

## Low-Level Proxy Sequence

```mermaid
sequenceDiagram
    autonumber
    actor T as WDIO Test
    participant App as Mobile App
    participant Proxy as proxy-itl.js
    participant State as Internal Proxy State

    T->>Proxy: POST /test/reset(notes)
    Proxy->>State: noteQueue = notes
    Proxy->>State: pollCount = 0
    Proxy->>State: currentNoteIndex = 0
    Proxy->>State: currentNoteCount = 0
    Proxy->>State: phase = IDLE
    Proxy->>State: done = false
    Proxy-->>T: { ok: true }

    loop App calls GetDeviceStatus
        App->>Proxy: GET /...GetDeviceStatus
        Proxy->>State: getNextState()

        alt done == true
            State-->>Proxy: DeviceState=IDLE, PollBuffer=[]
            Proxy-->>App: No more fake notes
        else phase == IDLE and pollCount < 5
            State-->>Proxy: DeviceState=IDLE, PollBuffer=[]
            Proxy-->>App: Delay before next simulated note
        else phase == IDLE and pollCount is ready
            State->>State: phase = ACCEPTING
            State->>State: pollCount = 0
            State-->>Proxy: DeviceStatusResponse(ACCEPTING)
            Proxy-->>App: Device is accepting cash
        else phase == ACCEPTING and pollCount == 1
            State->>State: Read noteQueue[currentNoteIndex]
            State->>State: phase = ESCROW
            State-->>Proxy: CashEventResponse(ESCROW, current note)
            Proxy-->>App: One note appears in escrow
        else phase == ESCROW
            State->>State: phase = ACCEPTING2
            State-->>Proxy: DeviceState=ACCEPTING, PollBuffer=[]
            Proxy-->>App: Intermediate accepting state
        else phase == ACCEPTING2
            State->>State: currentNoteCount++
            alt currentNoteCount >= note.count
                State->>State: currentNoteIndex++
                State->>State: currentNoteCount = 0
                alt currentNoteIndex >= noteQueue.length
                    State->>State: done = true
                end
            end
            State->>State: phase = done ? DONE : ACCEPTING
            State->>State: pollCount = 0
            State-->>Proxy: CashEventResponse(STORED) + DeviceStatusResponse(IDLE)
            Proxy-->>App: Current note is stored
        end
    end

    loop Test checks completion
        T->>Proxy: GET /test/status
        Proxy-->>T: { done }
    end
```

## Notes

- Values in `proxy-itl.js` are in minor units. `50000` means `500 THB`, and `10000` means `100 THB`.
- `GetDeviceStatus` is intercepted by the proxy. Other device endpoints are forwarded to `mock-itl-server.js`.
- The UI test does not rely on explicit assertions here. Success mostly depends on `waitForDisplayed`, `waitUntil`, and timeout behavior.
