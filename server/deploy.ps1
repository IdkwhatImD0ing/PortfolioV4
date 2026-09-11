#Requires -Version 5.1

# gcloud writes warnings to stderr which PowerShell treats as errors,
# so we use Continue and check $LASTEXITCODE manually for real failures.
$ErrorActionPreference = "Continue"

function Invoke-Gcloud {
    param([Parameter(ValueFromRemainingArguments)]$Args)
    & gcloud @Args 2>&1 | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) {
            Write-Host $_.Exception.Message -ForegroundColor Yellow
        } else {
            $_
        }
    }
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "gcloud failed with exit code $LASTEXITCODE"
    }
}

### ====== Config (edit these) ======
$PROJECT_ID    = if ($env:PROJECT_ID)    { $env:PROJECT_ID }    else { "spiritual-storm-469704-n2" }
$REGION        = if ($env:REGION)        { $env:REGION }        else { "us-west1" }
$SERVICE_NAME  = if ($env:SERVICE_NAME)  { $env:SERVICE_NAME }  else { "fastapi-ws" }
$MAX_INSTANCES = if ($env:MAX_INSTANCES) { $env:MAX_INSTANCES } else { "10" }
$CONCURRENCY   = if ($env:CONCURRENCY)  { $env:CONCURRENCY }  else { "200" }
$TIMEOUT       = if ($env:TIMEOUT)       { $env:TIMEOUT }       else { "3600" }
$KEEP_WARM     = if ($env:KEEP_WARM)     { $env:KEEP_WARM }     else { "0" }
$ALLOW_UNAUTH  = if ($env:ALLOW_UNAUTH)  { $env:ALLOW_UNAUTH }  else { "1" }
$KEY_FILE      = if ($env:KEY_FILE)      { $env:KEY_FILE }      else { "./gcloud.json" }
### =================================

# Check for service account key
if (-not (Test-Path $KEY_FILE) -and (Test-Path "../$(Split-Path $KEY_FILE -Leaf)")) {
    $KEY_FILE = "../$(Split-Path $KEY_FILE -Leaf)"
}

if (Test-Path $KEY_FILE) {
    Write-Host ">> Authenticating with service account key: $KEY_FILE"
    Invoke-Gcloud auth activate-service-account --key-file="$KEY_FILE"
} else {
    Write-Host ">> Using existing gcloud authentication (personal account)"
    Write-Host "   (Run 'gcloud auth login' if not authenticated)"
}

$activeAccount = (gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>$null) | Select-Object -First 1
Write-Host "Using account: $activeAccount"

Write-Host ">> Setting project & region..."
Invoke-Gcloud config set project $PROJECT_ID --quiet
Invoke-Gcloud config set run/region $REGION --quiet

Write-Host ">> Enabling APIs (Run, Build, Artifact Registry)..."
try {
    Invoke-Gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project $PROJECT_ID
} catch {
    Write-Host "Skipping API enable (no permission or already enabled)." -ForegroundColor Yellow
}

$MIN_INSTANCES = if ($KEEP_WARM -eq "1") { "1" } else { "0" }
$AUTH_FLAG = if ($ALLOW_UNAUTH -eq "1") { "--allow-unauthenticated" } else { "--no-allow-unauthenticated" }

Write-Host ">> Deploying $SERVICE_NAME to Cloud Run (build from source)..."
Invoke-Gcloud run deploy $SERVICE_NAME `
    --source . `
    --region $REGION `
    --concurrency $CONCURRENCY `
    --min-instances $MIN_INSTANCES `
    --max-instances $MAX_INSTANCES `
    --timeout "${TIMEOUT}s" `
    --execution-environment gen2 `
    --cpu-boost `
    $AUTH_FLAG

Write-Host "`nDeployed. Default URL:"
Invoke-Gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)"

$CUSTOM_DOMAIN = "portfolio-ws.art3m1s.me"

$mappingExists = $false
try {
    gcloud run domain-mappings describe $CUSTOM_DOMAIN --region $REGION 2>$null | Out-Null
    $mappingExists = $true
} catch {}

if ($mappingExists) {
    Write-Host ">> Domain mapping for $CUSTOM_DOMAIN already exists."
} else {
    Write-Host ">> Creating domain mapping for $CUSTOM_DOMAIN..."
    Invoke-Gcloud run domain-mappings create --service $SERVICE_NAME --domain $CUSTOM_DOMAIN --region $REGION
}

Write-Host "`nService is mapped to: https://$CUSTOM_DOMAIN"
