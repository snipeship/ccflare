#!/bin/bash
# Database diagnostic script - READ-ONLY analysis
# Usage: kubectl exec -it <pod-name> -n coder -- /app/scripts/diagnose-database.sh

set -e

DB_PATH="/app/data/ccflare.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🔍 Database Diagnostic Report"
echo "Timestamp: $TIMESTAMP"
echo "Database path: $DB_PATH"
echo "========================================"
echo ""

# File system analysis
echo "📁 FILE SYSTEM ANALYSIS:"
echo "------------------------"
if [ -f "$DB_PATH" ]; then
    echo "✅ Main database file exists"
    ls -la "$DB_PATH"
    echo "File type: $(file "$DB_PATH")"
    echo "File size: $(du -h "$DB_PATH" | cut -f1)"
else
    echo "❌ Main database file missing: $DB_PATH"
fi

if [ -f "$DB_PATH-wal" ]; then
    echo "✅ WAL file exists"
    ls -la "$DB_PATH-wal"
    echo "WAL size: $(du -h "$DB_PATH-wal" | cut -f1)"
else
    echo "ℹ️  No WAL file found"
fi

if [ -f "$DB_PATH-shm" ]; then
    echo "✅ SHM file exists"
    ls -la "$DB_PATH-shm"
else
    echo "ℹ️  No SHM file found"
fi

echo ""

# Database header analysis
echo "🔬 DATABASE HEADER ANALYSIS:"
echo "----------------------------"
if [ -f "$DB_PATH" ]; then
    echo "First 100 bytes of database file:"
    hexdump -C "$DB_PATH" | head -5
    echo ""
    
    # Check SQLite magic number
    MAGIC=$(hexdump -C "$DB_PATH" | head -1 | cut -d' ' -f2-5)
    if [[ "$MAGIC" == "53 51 4c 69" ]]; then
        echo "✅ SQLite magic number present (53 51 4c 69)"
    else
        echo "❌ Invalid SQLite magic number: $MAGIC"
        echo "   Expected: 53 51 4c 69 (SQLi)"
    fi
fi

echo ""

# SQLite integrity checks
echo "🔍 SQLITE INTEGRITY CHECKS:"
echo "---------------------------"
if [ -f "$DB_PATH" ]; then
    echo "Testing database connectivity..."
    if sqlite3 "$DB_PATH" "SELECT 1;" 2>/dev/null >/dev/null; then
        echo "✅ Database is accessible"
        
        echo ""
        echo "Journal mode:"
        sqlite3 "$DB_PATH" "PRAGMA journal_mode;" 2>/dev/null || echo "❌ Cannot read journal mode"
        
        echo ""
        echo "Database schema version:"
        sqlite3 "$DB_PATH" "PRAGMA schema_version;" 2>/dev/null || echo "❌ Cannot read schema version"
        
        echo ""
        echo "Page size:"
        sqlite3 "$DB_PATH" "PRAGMA page_size;" 2>/dev/null || echo "❌ Cannot read page size"
        
        echo ""
        echo "Database size info:"
        sqlite3 "$DB_PATH" "PRAGMA page_count; PRAGMA freelist_count;" 2>/dev/null || echo "❌ Cannot read size info"
        
        echo ""
        echo "Integrity check:"
        INTEGRITY=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null || echo "FAILED")
        if [[ "$INTEGRITY" == "ok" ]]; then
            echo "✅ Database integrity: OK"
        else
            echo "❌ Database integrity: $INTEGRITY"
        fi
        
        echo ""
        echo "Quick corruption check:"
        sqlite3 "$DB_PATH" "PRAGMA quick_check;" 2>/dev/null || echo "❌ Quick check failed"
        
    else
        echo "❌ Database is not accessible"
        echo "Error details:"
        sqlite3 "$DB_PATH" "SELECT 1;" 2>&1 || true
    fi
fi

echo ""

# Table analysis
echo "📊 TABLE ANALYSIS:"
echo "------------------"
if sqlite3 "$DB_PATH" "SELECT 1;" 2>/dev/null >/dev/null; then
    echo "Database tables:"
    sqlite3 "$DB_PATH" ".tables" 2>/dev/null || echo "❌ Cannot list tables"
    
    echo ""
    echo "Table row counts:"
    for table in $(sqlite3 "$DB_PATH" ".tables" 2>/dev/null); do
        count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "ERROR")
        echo "  $table: $count rows"
    done
    
    echo ""
    echo "Recent requests (if accessible):"
    sqlite3 "$DB_PATH" "SELECT id, timestamp, success FROM requests ORDER BY timestamp DESC LIMIT 5;" 2>/dev/null || echo "❌ Cannot read requests table"
fi

echo ""

# WAL analysis
echo "📝 WAL FILE ANALYSIS:"
echo "---------------------"
if [ -f "$DB_PATH-wal" ]; then
    echo "WAL file header:"
    hexdump -C "$DB_PATH-wal" | head -3
    
    echo ""
    echo "WAL checkpoint status:"
    sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint;" 2>/dev/null || echo "❌ WAL checkpoint failed"
    
    echo ""
    echo "WAL autocheckpoint setting:"
    sqlite3 "$DB_PATH" "PRAGMA wal_autocheckpoint;" 2>/dev/null || echo "❌ Cannot read WAL autocheckpoint"
else
    echo "ℹ️  No WAL file to analyze"
fi

echo ""

# Recovery recommendations
echo "💡 RECOVERY RECOMMENDATIONS:"
echo "----------------------------"
if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
    echo "✅ Database appears healthy"
    echo "   - Try restarting the application"
    echo "   - Check for file locking issues"
    echo "   - Verify file permissions"
else
    echo "❌ Database corruption detected"
    echo ""
    echo "Safe recovery steps to try:"
    echo "1. WAL checkpoint: sqlite3 $DB_PATH 'PRAGMA wal_checkpoint(FULL);'"
    echo "2. Vacuum: sqlite3 $DB_PATH 'VACUUM;'"
    echo "3. Dump data: sqlite3 $DB_PATH '.dump' > /app/data/backups/dump_$TIMESTAMP.sql"
    echo "4. Recovery mode: sqlite3 $DB_PATH '.recover' > /app/data/backups/recover_$TIMESTAMP.sql"
    echo ""
    echo "⚠️  DO NOT delete database files without manual review"
fi

echo ""
echo "========================================"
echo "🔍 Diagnostic complete: $TIMESTAMP"
echo "📁 Save this output for analysis"
