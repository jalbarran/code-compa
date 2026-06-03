package discovery

import (
	"net"
	"strings"
)

// GetLocalIP returns the primary local network IP, filtering out virtual/VPN interfaces.
func GetLocalIP() (string, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return "", err
	}

	var candidateIPs []string
	for _, iface := range interfaces {
		// Skip down and loopback interfaces
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		// Skip virtual/VPN/docker interfaces
		name := strings.ToLower(iface.Name)
		if isVirtualInterface(name) {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}

			if ip == nil || ip.IsLoopback() {
				continue
			}

			ip = ip.To4()
			if ip == nil {
				continue // Skip IPv6
			}

			candidateIPs = append(candidateIPs, ip.String())
		}
	}

	if len(candidateIPs) > 0 {
		return candidateIPs[0], nil
	}

	// Fallback to UDP Dial Test if interface scan yields no results
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "", err
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String(), nil
}

func isVirtualInterface(name string) bool {
	virtualPrefixes := []string{"tun", "tap", "docker", "br-", "veth", "virbr", "ppp", "wg", "zt", "tailscale", "zero", "utun"}
	for _, prefix := range virtualPrefixes {
		if strings.HasPrefix(name, prefix) {
			return true
		}
	}
	return false
}
