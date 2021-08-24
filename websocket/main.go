package main

import (
	"context"
	"flag"

	"github.com/klintcheng/chatdemo/serv"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

const version = "v1"

func main() {
	flag.Parse()

	root := &cobra.Command{
		Use:     "websocker server",
		Version: version,
		Short:   "ws server",
	}
	ctx := context.Background()

	root.AddCommand(serv.NewServerStartCmd(ctx, version))

	if err := root.Execute(); err != nil {
		logrus.WithError(err).Fatal("Could not run command")
	}
}
