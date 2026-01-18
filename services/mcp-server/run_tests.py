"""
Test runner script for MCP server tests
"""

import sys
import os
import subprocess
import argparse
from pathlib import Path

def run_command(cmd, description=""):
    """Run a command and handle errors"""
    print(f"\n{'='*60}")
    if description:
        print(f"Running: {description}")
    print(f"Command: {' '.join(cmd)}")
    print('='*60)
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {e}")
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
        return False

def main():
    """Main test runner"""
    parser = argparse.ArgumentParser(description="MCP Server Test Runner")
    parser.add_argument(
        "test_type",
        choices=["all", "unit", "integration", "performance", "storage_client", "mcp_server"],
        help="Type of tests to run"
    )
    parser.add_argument(
        "--coverage",
        action="store_true",
        help="Run with coverage report"
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Verbose output"
    )
    parser.add_argument(
        "--parallel",
        "-n",
        type=int,
        default=4,
        help="Number of parallel processes"
    )
    parser.add_argument(
        "--benchmark",
        action="store_true",
        help="Run benchmark tests"
    )
    
    args = parser.parse_args()
    
    # Change to the MCP server directory
    mcp_server_dir = Path(__file__).parent
    os.chdir(mcp_server_dir)
    
    # Base pytest command
    pytest_cmd = ["python", "-m", "pytest"]
    
    # Add verbosity
    if args.verbose:
        pytest_cmd.append("-v")
    
    # Add parallel execution
    if args.parallel > 1:
        pytest_cmd.extend(["-n", str(args.parallel)])
    
    # Add coverage
    if args.coverage:
        pytest_cmd.extend([
            "--cov=main",
            "--cov-report=html",
            "--cov-report=term-missing",
            "--cov-report=xml"
        ])
    
    # Add benchmark
    if args.benchmark:
        pytest_cmd.append("--benchmark-only")
    
    # Determine which tests to run
    test_paths = []
    markers = []
    
    if args.test_type == "all":
        test_paths = ["tests/"]
        markers = ["-m", "not slow"]
    elif args.test_type == "unit":
        test_paths = ["tests/test_storage_client.py", "tests/test_mcp_server.py"]
        markers = ["-m", "unit"]
    elif args.test_type == "integration":
        test_paths = ["tests/test_integration.py"]
        markers = ["-m", "integration"]
    elif args.test_type == "performance":
        test_paths = ["tests/test_performance.py"]
        markers = ["-m", "performance or stress"]
    elif args.test_type == "storage_client":
        test_paths = ["tests/test_storage_client.py"]
        markers = ["-m", "storage_client"]
    elif args.test_type == "mcp_server":
        test_paths = ["tests/test_mcp_server.py"]
        markers = ["-m", "mcp_server"]
    
    # Build final command
    final_cmd = pytest_cmd + test_paths + markers
    
    # Install test dependencies if needed
    print("Installing test dependencies...")
    if not run_command([
        "pip", "install", "-r", "requirements-test.txt"
    ], "Installing test dependencies"):
        print("Failed to install test dependencies")
        sys.exit(1)
    
    # Run the tests
    success = run_command(final_cmd, f"Running {args.test_type} tests")
    
    if success:
        print(f"\n✅ {args.test_type.title()} tests passed!")
        
        # Show coverage report if generated
        if args.coverage:
            print("\n📊 Coverage report generated in htmlcov/index.html")
    else:
        print(f"\n❌ {args.test_type.title()} tests failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
