package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/phil616/stunnel-cp/internal/buildinfo"
	"github.com/phil616/stunnel-cp/internal/config"
)

type cliOptions struct {
	configPath string
	version    bool
}

func parseArgs(args []string) (cliOptions, error) {
	var options cliOptions
	flags := flag.NewFlagSet("stunnel-cp", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.StringVar(&options.configPath, "c", "", "YAML configuration file")
	flags.StringVar(&options.configPath, "config", "", "YAML configuration file")
	flags.BoolVar(&options.version, "version", false, "Print version and exit")
	if len(args) > 0 && args[0] == "help" {
		if len(args) == 1 || (len(args) == 2 && args[1] == "serve") {
			return options, flag.ErrHelp
		}
		return options, fmt.Errorf("usage: stunnel-cp help [serve]")
	}
	if err := flags.Parse(args); err != nil {
		return options, err
	}
	if rest := flags.Args(); len(rest) != 0 {
		if rest[0] != "serve" {
			return options, fmt.Errorf("unknown command %q (use serve)", rest[0])
		}
		if err := flags.Parse(rest[1:]); err != nil {
			return options, err
		}
		if flags.NArg() != 0 {
			return options, fmt.Errorf("serve does not accept positional arguments")
		}
	}
	var emptyPath bool
	flags.Visit(func(f *flag.Flag) {
		if (f.Name == "c" || f.Name == "config") && strings.TrimSpace(options.configPath) == "" {
			emptyPath = true
		}
	})
	if emptyPath {
		return options, fmt.Errorf("-c / --config requires a nonempty file path")
	}
	return options, nil
}

func usage(w io.Writer) {
	fmt.Fprint(w, `Usage:
  stunnel-cp [serve] [-c config.yml]
  stunnel-cp --version

Commands:
  serve                Start the web control plane (default).

Options:
  -c, --config FILE    Load the specified YAML configuration file.
  --version            Print version information and exit.
  -h, --help           Show help and exit.

Configuration priority: environment > YAML file > defaults.
`)
}

func execute(args []string, stdout, stderr io.Writer) int {
	options, err := parseArgs(args)
	if errors.Is(err, flag.ErrHelp) {
		usage(stdout)
		return 0
	}
	if err != nil {
		fmt.Fprintln(stderr, "stunnel-cp:", err)
		return 2
	}
	if options.version {
		fmt.Fprintf(stdout, "stunnel-cp %s\ncommit: %s\nbuilt: %s\n", buildinfo.Version, buildinfo.Commit, buildinfo.Date)
		return 0
	}
	logger := slog.New(slog.NewJSONHandler(stdout, nil))
	cfg, err := config.Load(options.configPath)
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		return 1
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, cfg, logger); err != nil {
		logger.Error("server stopped", "error", err)
		return 1
	}
	return 0
}
