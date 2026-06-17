#!/usr/bin/env bash
# Deploya los 3 proyectos demo en Vercel (admin, pos, web) sin tocar
# el repo ni los proyectos turisteando-* existentes.
#
# Estrategia segura:
#   1. Crea un vercel.json LOCAL temporal en cada app con los install/build
#      commands para monorepo pnpm.
#   2. Linkea + deploya (Vercel respeta ese vercel.json).
#   3. Borra el vercel.json antes de terminar.
#   4. trap EXIT garantiza el cleanup aunque algo falle a mitad.
#
# Los proyectos turisteando-* NO se ven afectados porque sus deploys
# se disparan vía git push, no leen archivos locales sin commitear.
#
# Requisitos:
#   - Vercel CLI instalado y logueado (vercel whoami)
#
# Uso:
#   bash scripts/deploy-demo.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v vercel >/dev/null 2>&1; then
  echo "❌ Vercel CLI no instalado. pnpm i -g vercel"
  exit 1
fi

echo "→ Chequeando sesión de Vercel…"
if ! vercel whoami >/dev/null 2>&1; then
  echo "❌ No estás logueado. Corré: vercel login"
  exit 1
fi
echo "   Logueado como: $(vercel whoami)"

# Si algo falla a mitad, igual borrar vercel.json temporales y restaurar el original del PoS.
POS_VERCEL_BAK=""
TMP_FILES=()
cleanup() {
  set +e
  for f in "${TMP_FILES[@]}"; do
    [ -f "$f" ] && rm -f "$f"
  done
  # El PoS YA tiene un vercel.json original commiteado; lo respetamos.
  if [ -n "$POS_VERCEL_BAK" ] && [ -f "$POS_VERCEL_BAK" ]; then
    mv "$POS_VERCEL_BAK" "$REPO_ROOT/apps/pos/vercel.json"
  fi
}
trap cleanup EXIT INT TERM

deploy_app() {
  local nombre="$1"        # nombre del proyecto Vercel
  local app="$2"           # apps/X
  local pkg="$3"           # @comercio/X
  local env_var="$4"       # NEXT_PUBLIC_BRAND_NAME o VITE_BRAND_NAME
  local framework="$5"     # nextjs o vite
  local output_dir="$6"    # "" para Next, "dist" para Vite
  local extra_json="$7"    # JSON extra para mergear (ej. rewrites del PoS)

  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  Deploy: $nombre"
  echo "  Carpeta: $app · Framework: $framework"
  echo "═══════════════════════════════════════════════════════════"

  local app_dir="$REPO_ROOT/$app"
  local vjson="$app_dir/vercel.json"

  # Backup del vercel.json si ya existe (el PoS tiene uno commiteado).
  if [ -f "$vjson" ]; then
    POS_VERCEL_BAK="${vjson}.bak.$$"
    cp "$vjson" "$POS_VERCEL_BAK"
    echo "   ↳ Backup del vercel.json existente"
  fi
  TMP_FILES+=("$vjson")

  # Generar vercel.json temporal para este deploy.
  local output_line=""
  [ -n "$output_dir" ] && output_line="\"outputDirectory\": \"$output_dir\","

  cat > "$vjson" <<EOF
{
  "\$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "cd ../.. && pnpm install --no-frozen-lockfile",
  "buildCommand": "cd ../.. && pnpm --filter $pkg build",
  $output_line
  "framework": "$framework"$extra_json
}
EOF

  cd "$app_dir"

  # Linkear (crea el proyecto si no existe en la cuenta).
  vercel link --project "$nombre" --yes

  # Setear env var de branding.
  echo "Comercio Demo" | vercel env add "$env_var" production 2>/dev/null || true
  echo "Comercio Demo" | vercel env add "$env_var" preview 2>/dev/null || true

  # Deploy a producción.
  vercel --prod --yes

  cd "$REPO_ROOT"

  # Restaurar vercel.json original si existía.
  if [ -n "$POS_VERCEL_BAK" ] && [ -f "$POS_VERCEL_BAK" ]; then
    mv "$POS_VERCEL_BAK" "$vjson"
    POS_VERCEL_BAK=""
    echo "   ↳ vercel.json original restaurado"
  fi
}

# Rewrite SPA del PoS — solo aplica al PoS.
POS_REWRITES=',"rewrites":[{"source":"/(.*)","destination":"/index.html"}]'

deploy_app "comercio-demo-admin" "apps/admin" "@comercio/admin" "NEXT_PUBLIC_BRAND_NAME" "nextjs" ""     ""
deploy_app "comercio-demo-pos"   "apps/pos"   "@comercio/pos"   "VITE_BRAND_NAME"        "vite"   "dist" "$POS_REWRITES"
deploy_app "comercio-demo-web"   "apps/web"   "@comercio/web"   "NEXT_PUBLIC_BRAND_NAME" "nextjs" ""     ""

echo ""
echo "✅ Listo. Buscá los URLs de producción que imprimió cada deploy más arriba"
echo "   (o entrá a https://vercel.com/dashboard)."
echo ""
echo "Convención esperada:"
echo "   Admin: https://comercio-demo-admin.vercel.app"
echo "   PoS:   https://comercio-demo-pos.vercel.app"
echo "   Web:   https://comercio-demo-web.vercel.app"
