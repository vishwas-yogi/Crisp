import Cocoa

// macOS Carbon virtual key codes (HIToolbox/Events.h)
let keyCodeMap: [String: UInt16] = [
    "a": 0,  "s": 1,  "d": 2,  "f": 3,  "h": 4,  "g": 5,  "z": 6,  "x": 7,
    "c": 8,  "v": 9,  "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16,
    "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "9": 25,
    "7": 26, "8": 28, "0": 29, "o": 31, "u": 32, "i": 34, "p": 35, "l": 37,
    "j": 38, "k": 40, "n": 45, "m": 46, ".": 47, ",": 43, "/": 44, "space": 49,
    "f1": 122, "f2": 120, "f3": 99,  "f4": 118, "f5": 96,  "f6": 97,
    "f7": 98,  "f8": 100, "f9": 101, "f10": 109, "f11": 103, "f12": 111,
]

// Parse "cmd+shift+r" style hotkey string from first argument
let hotkeyArg = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "cmd+shift+r"
let parts = hotkeyArg.lowercased().split(separator: "+").map(String.init)

var targetMods: NSEvent.ModifierFlags = []
var targetKeyCode: UInt16 = 0

for part in parts.dropLast() {
    switch part {
    case "cmd", "command", "meta": targetMods.insert(.command)
    case "shift":                  targetMods.insert(.shift)
    case "ctrl", "control":        targetMods.insert(.control)
    case "alt", "option":          targetMods.insert(.option)
    default: break
    }
}

guard let kc = keyCodeMap[parts.last ?? ""] else {
    fputs("crisp-hotkey: unknown key '\(parts.last ?? "")'\n", stderr)
    exit(1)
}
targetKeyCode = kc

// Disable stdout buffering so Node.js readline receives lines immediately
setbuf(stdout, nil)

// Prompt for Accessibility permission if not already granted.
// macOS shows a proper system dialog for a compiled binary — this is why
// we use a Swift helper rather than uiohook-napi (node binaries are not
// code-signed so the TCC permission silently fails).
let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
let trusted = AXIsProcessTrustedWithOptions(opts)
if !trusted {
    fputs("crisp-hotkey: waiting for Accessibility permission (check System Settings)...\n", stderr)
}

// Establish a window server connection — required for NSEvent to receive events
let _ = NSApplication.shared

NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { event in
    let mods = event.modifierFlags.intersection([.command, .shift, .control, .option])
    if event.keyCode == targetKeyCode && mods == targetMods {
        print("HOTKEY")
    }
}

fputs("crisp-hotkey: listening for \(hotkeyArg)\n", stderr)

RunLoop.main.run()
