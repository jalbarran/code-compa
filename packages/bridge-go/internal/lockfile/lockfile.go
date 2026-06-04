package lockfile

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type LockData struct {
	Pid   int    `json:"pid"`
	Port  int    `json:"port"`
	Token string `json:"token"`
}

func GetLockfilePath(workspacePath string) string {
	hash := sha256.Sum256([]byte(workspacePath))
	hashStr := hex.EncodeToString(hash[:])
	return filepath.Join(os.TempDir(), fmt.Sprintf("code-compa-%s.lock", hashStr))
}

func ReadLockfile(path string) (*LockData, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var lock LockData
	if err := json.Unmarshal(data, &lock); err != nil {
		return nil, err
	}
	return &lock, nil
}

func WriteLockfile(path string, pid int, port int, token string) error {
	lock := LockData{Pid: pid, Port: port, Token: token}
	data, err := json.Marshal(lock)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func CheckAndAcquire(workspacePath string, port int, token string) (int, bool, error) {
	path := GetLockfilePath(workspacePath)
	lock, err := ReadLockfile(path)
	if err == nil {
		if IsProcessAlive(lock.Pid) {
			return lock.Port, false, nil // Already running, return its port
		}
		// Stale lockfile, remove it
		_ = os.Remove(path)
	}

	err = WriteLockfile(path, os.Getpid(), port, token)
	if err != nil {
		return 0, false, err
	}
	return port, true, nil
}
