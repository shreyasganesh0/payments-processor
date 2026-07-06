#!/usr/bin/env bash
# Run ON the EC2 instance (Ubuntu). Installs single-node k3s (lightweight
# Kubernetes) with its bundled Traefik ingress, and makes kubectl usable.
set -euo pipefail

curl -sfL https://get.k3s.io | sh -

# let the default user run kubectl without sudo
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
if ! grep -q KUBECONFIG ~/.bashrc; then
  echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc
fi
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

kubectl get nodes
echo
echo "k3s is up. Next: create app-secret and apply the overlay —"
echo "see k8s/overlays/aws/README.md."
