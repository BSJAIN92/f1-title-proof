$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Get-Content -Raw -LiteralPath (Join-Path $root 'manifest.json') | ConvertFrom-Json
$results = Get-Content -Raw -LiteralPath (Join-Path $root 'session-results.json') | ConvertFrom-Json
$countback = Get-Content -Raw -LiteralPath (Join-Path $root 'countback.json') | ConvertFrom-Json
$sourceDocuments = Get-Content -Raw -LiteralPath (Join-Path $root 'source-documents.json') | ConvertFrom-Json
$retirementFixture = Get-Content -Raw -LiteralPath (Join-Path $root 'classified-retirement-fixture.json') | ConvertFrom-Json

function Assert-Equal($actual, $expected, $label) {
    if ($actual -ne $expected) {
        throw "FAIL: $label expected $expected but received $actual"
    }
}

Assert-Equal $results.errors.Count 0 'result extraction errors'
Assert-Equal $countback.errors.Count 0 'countback extraction errors'
Assert-Equal $results.events.Count 17 'completed sessions'
Assert-Equal (($results.events | Where-Object session -eq 'race').Count) 12 'completed races'
Assert-Equal (($results.events | Where-Object session -eq 'sprint').Count) 5 'completed Sprints'
Assert-Equal (($results.events.rows | Measure-Object).Count) 374 'completed classification rows'
Assert-Equal $countback.qualifying_events.Count 12 'qualifying fallback events'
Assert-Equal (($countback.qualifying_events.rows | Measure-Object).Count) 264 'qualifying rows'
Assert-Equal (($manifest.futureLineup.drivers | Measure-Object).Count) 22 'future drivers'
Assert-Equal $manifest.remainingSessions.Count 12 'remaining points-paying sessions'
Assert-Equal $sourceDocuments.documents.Count 36 'source documents'
Assert-Equal (@($sourceDocuments.documents | Where-Object httpStatus -ne 200).Count) 0 'unreachable source documents at freeze time'

$classifiedDnfs = @($results.events.rows | Where-Object { $null -ne $_.position -and $_.status -eq 'DNF' })
Assert-Equal $classifiedDnfs.Count 6 'classified DNF rows'
$classifiedDnfKeys = @($classifiedDnfs | ForEach-Object { "$($_.driver):$($_.position)" } | Sort-Object)
$expectedDnfKeys = @('Alexander Albon:17','Carlos Sainz:16','Charles Leclerc:15','Kimi Antonelli:16','Max Verstappen:20','Oliver Bearman:17') | Sort-Object
Assert-Equal ($classifiedDnfKeys -join '|') ($expectedDnfKeys -join '|') 'classified DNF identities'
Assert-Equal $retirementFixture.result.status 'DNF' 'classified-retirement fixture status'
Assert-Equal $retirementFixture.result.position 10 'classified-retirement fixture position'
Assert-Equal $retirementFixture.result.awardedPoints 1 'classified-retirement fixture awarded points'

$driverTotals = @{}
$constructorTotals = @{}
foreach ($row in $results.events.rows) {
    if (-not $driverTotals.ContainsKey($row.driver)) { $driverTotals[$row.driver] = 0 }
    if (-not $constructorTotals.ContainsKey($row.constructor)) { $constructorTotals[$row.constructor] = 0 }
    $driverTotals[$row.driver] += [int]$row.awarded_points
    $constructorTotals[$row.constructor] += [int]$row.awarded_points
}

foreach ($standing in $manifest.driverStandings) {
    $actual = if ($driverTotals.ContainsKey($standing.driver)) { $driverTotals[$standing.driver] } else { 0 }
    Assert-Equal $actual $standing.points "driver points for $($standing.driver)"
}

foreach ($standing in $manifest.constructorStandings) {
    $actual = if ($constructorTotals.ContainsKey($standing.constructor)) { $constructorTotals[$standing.constructor] } else { 0 }
    Assert-Equal $actual $standing.points "constructor points for $($standing.constructor)"
}

$expectedHashes = $manifest.artifacts
$actualResultsHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $expectedHashes.sessionResults.path)).Hash
$actualCountbackHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $expectedHashes.countback.path)).Hash
$actualSourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $expectedHashes.sourceDocuments.path)).Hash
Assert-Equal $actualResultsHash $expectedHashes.sessionResults.sha256 'session-results checksum'
Assert-Equal $actualCountbackHash $expectedHashes.countback.sha256 'countback checksum'
Assert-Equal $actualSourceHash $expectedHashes.sourceDocuments.sha256 'source-documents checksum'

$dutchRace = $results.events | Where-Object { $_.event -eq 'netherlands' -and $_.session -eq 'race' }
$lawson = $dutchRace.rows | Where-Object driver -eq 'Liam Lawson'
$tsunoda = $dutchRace.rows | Where-Object driver -eq 'Yuki Tsunoda'
Assert-Equal $lawson.constructor 'Oracle Red Bull Racing' 'Dutch Lawson constructor'
Assert-Equal $lawson.awarded_points 6 'Dutch Lawson points'
Assert-Equal $tsunoda.constructor 'Visa Cash App Racing Bulls F1 Team' 'Dutch Tsunoda constructor'

Write-Output 'PASS: frozen dataset is internally consistent and matches the stored standings totals.'
