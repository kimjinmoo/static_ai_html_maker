import sys


def log(msg):
    """Print to stderr with immediate flush - always visible regardless of debug mode."""
    print(msg, file=sys.stderr, flush=True)
