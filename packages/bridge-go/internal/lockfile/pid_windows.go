//go:build windows

package lockfile

import (
	"syscall"
)

func IsProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	const processQueryLimitedInformation = 0x1000
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	openProcess := kernel32.NewProc("OpenProcess")
	handle, _, _ := openProcess.Call(
		uintptr(processQueryLimitedInformation),
		0,
		uintptr(pid),
	)
	if handle == 0 {
		return false
	}
	closeHandle := kernel32.NewProc("CloseHandle")
	closeHandle.Call(handle)
	return true
}
