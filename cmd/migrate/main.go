package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	dir := "file://infra/migrations"
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://pooli:pooli@localhost:5432/pooli?sslmode=disable"
	}
	m, err := migrate.New(dir, dbURL)
	if err != nil {
		fatal(err)
	}
	defer m.Close()
	cmd := "up"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	switch cmd {
	case "up":
		err = m.Up()
	case "down":
		err = m.Steps(-1)
	default:
		fatal(fmt.Errorf("unknown command %s", cmd))
	}
	if err != nil && !errors.Is(err, migrate.ErrNoChange) {
		fatal(err)
	}
	fmt.Println("migrate", cmd, "ok")
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
