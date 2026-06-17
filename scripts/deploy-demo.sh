#!/usr/bin/env bash
# Deploya los 3 proyectos demo en Vercel (admin, pos, web) usando el CLI.
# Una vez corrido, imprime las URLs públicas.
#
# Requisitos:
#   - Vercel CLI instalado (lo tenés)
#   - Estar logueado: `vercel login`  (te pide email, te manda magic link)
#
# Uso:
#   bash scripts/deploy-demo.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v vercel >/dev/null 2>&1; then
  echo "❌ Vercel CLI no instalado. pnpm i -g vercel"
  exit 1
fi

echo "→ ¿Logueado en Vercel?"
vercel whoami >/dev/null 2>&1 || {
  echo "No estás logueado. Corré: vercel login"
  exit 1
}

deploy_app() {
  local nombre="$1"     # nombre del proyecto Vercel
  local dir="$2"        # ruta relativa de la app
  local env_var="$3"    # ej. NEXT_PUBLIC_BRAND_NAME o VITE_BRAND_NAME

  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  Deploy: $nombre"
  echo "  Carpeta: $dir"
  echo "═══════════════════════════════════════════════════════════"

  cd "$REPO_ROOT/$dir"

  # Linkear al proyecto (lo crea si no existe).
  vercel link --project "$nombre" --yes

  # Setear env var de branding en preview y production.
  echo "Comercio Demo" | vercel env add "$env_var" production --force --yes 2>/dev/null || true
  echo "Comercio Demo" | vercel env add "$env_var" preview --force --yes 2>/dev/null || true

  # Deploy a producción.
  vercel --prod --yes

  cd "$REPO_ROOT"
}

deploy_app "comercio-demo-admin" "apps/admin" "NEXT_PUBLIC_BRAND_NAME"
deploy_app "comercio-demo-pos"   "apps/pos"   "VITE_BRAND_NAME"
deploy_app "comercio-demo-web"   "apps/web"   "NEXT_PUBLIC_BRAND_NAME"

echo ""
echo "✅ Listo. URLs públicas:"
echo "   Admin: https://comercio-demo-admin.vercel.app"
echo "   PoS:   https://comercio-demo-pos.vercel.app"
echo "   Web:   https://comercio-demo-web.vercel.app"
echo ""
echo "(Si alguno está tomado, mirá en https://vercel.com/dashboard"
echo " el dominio real que te asignó.)"
