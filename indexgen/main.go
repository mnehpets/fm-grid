package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"gopkg.in/yaml.v3"
)

type ViewDef struct {
	Name    string              `yaml:"name"     json:"name"`
	Filters map[string][]string `yaml:"filters"  json:"filters,omitempty"`
	GroupBy string              `yaml:"group_by" json:"group_by,omitempty"`
	SortBy  string              `yaml:"sort_by"  json:"sort_by,omitempty"`
	SortDir string              `yaml:"sort_dir" json:"sort_dir,omitempty"`
}

type Config struct {
	SourceDir        string              `yaml:"source_dir"`
	Output           string              `yaml:"output"`
	IDField          string              `yaml:"id_field"`
	TitleField       string              `yaml:"title_field"`
	Columns          []string            `yaml:"columns"`
	ControlledFields map[string][]string `yaml:"controlled_fields"`
	ExcerptLines     int                 `yaml:"excerpt_lines"`
	Views            []ViewDef           `yaml:"views"`
}

type Record struct {
	Path    string                 `json:"path"`
	ETag    string                 `json:"etag"`
	Fields  map[string]interface{} `json:"fields"`
	Excerpt string                 `json:"excerpt"`
}

type IndexError struct {
	Path  string `json:"path"`
	Error string `json:"error"`
}

type IndexConfig struct {
	IDField          string              `json:"id_field"`
	TitleField       string              `json:"title_field"`
	Columns          []string            `json:"columns"`
	ControlledFields map[string][]string `json:"controlled_fields"`
	Views            []ViewDef           `json:"views,omitempty"`
}

type Index struct {
	GeneratedAt time.Time    `json:"generated_at"`
	Config      IndexConfig  `json:"config"`
	Records     []Record     `json:"records"`
	Errors      []IndexError `json:"errors"`
}

func main() {
	configPath := flag.String("config", "", "path to config YAML file")
	flag.Parse()
	if *configPath == "" && flag.NArg() > 0 {
		*configPath = flag.Arg(0)
	}
	if *configPath == "" {
		log.Fatal("usage: indexgen --config <config.yaml>")
	}

	cfg, err := loadConfig(*configPath)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	cfgDir := filepath.Dir(*configPath)
	if !filepath.IsAbs(cfg.SourceDir) {
		cfg.SourceDir = filepath.Join(cfgDir, cfg.SourceDir)
	}
	if !filepath.IsAbs(cfg.Output) {
		cfg.Output = filepath.Join(cfgDir, cfg.Output)
	}
	if cfg.ExcerptLines == 0 {
		cfg.ExcerptLines = 3
	}

	idx, err := generate(cfg)
	if err != nil {
		log.Fatalf("generate: %v", err)
	}

	out, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		log.Fatalf("marshal: %v", err)
	}

	if err := os.MkdirAll(filepath.Dir(cfg.Output), 0755); err != nil {
		log.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(cfg.Output, out, 0644); err != nil {
		log.Fatalf("write: %v", err)
	}

	fmt.Printf("wrote %d records, %d errors to %s\n", len(idx.Records), len(idx.Errors), cfg.Output)
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func generate(cfg *Config) (*Index, error) {
	idx := &Index{
		GeneratedAt: time.Now().UTC(),
		Config: IndexConfig{
			IDField:          cfg.IDField,
			TitleField:       cfg.TitleField,
			Columns:          cfg.Columns,
			ControlledFields: cfg.ControlledFields,
			Views:            cfg.Views,
		},
		Errors: []IndexError{},
	}

	allowed := make(map[string]map[string]bool)
	for field, values := range cfg.ControlledFields {
		set := make(map[string]bool, len(values))
		for _, v := range values {
			set[v] = true
		}
		allowed[field] = set
	}

	err := filepath.Walk(cfg.SourceDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || !strings.HasSuffix(path, ".md") {
			return nil
		}

		rel, _ := filepath.Rel(cfg.SourceDir, path)

		data, err := os.ReadFile(path)
		if err != nil {
			idx.Errors = append(idx.Errors, IndexError{Path: rel, Error: err.Error()})
			return nil
		}

		fields, body, ok := parseFrontmatter(data)
		if !ok {
			idx.Errors = append(idx.Errors, IndexError{Path: rel, Error: "no frontmatter"})
			return nil
		}

		for field, set := range allowed {
			v, exists := fields[field]
			if !exists {
				continue
			}
			s, isStr := v.(string)
			if !isStr || !set[s] {
				idx.Errors = append(idx.Errors, IndexError{
					Path:  rel,
					Error: fmt.Sprintf("field %q value %q not in vocabulary", field, v),
				})
				return nil
			}
		}

		h := sha256.Sum256(data)
		etag := hex.EncodeToString(h[:])

		idx.Records = append(idx.Records, Record{
			Path:    rel,
			ETag:    etag,
			Fields:  fields,
			Excerpt: excerpt(body, cfg.ExcerptLines),
		})
		return nil
	})
	if err != nil {
		return nil, err
	}

	if cfg.IDField != "" {
		sort.Slice(idx.Records, func(i, j int) bool {
			a, _ := idx.Records[i].Fields[cfg.IDField].(string)
			b, _ := idx.Records[j].Fields[cfg.IDField].(string)
			return idLess(a, b)
		})
	}

	return idx, nil
}

func parseFrontmatter(data []byte) (map[string]interface{}, string, bool) {
	s := string(data)
	if !strings.HasPrefix(s, "---\n") {
		return nil, "", false
	}
	rest := s[4:]
	end := strings.Index(rest, "\n---\n")
	var body string
	if end < 0 {
		if strings.HasSuffix(rest, "\n---") {
			end = len(rest) - 4
		} else {
			return nil, "", false
		}
	} else {
		body = rest[end+5:]
	}

	var fields map[string]interface{}
	if err := yaml.Unmarshal([]byte(rest[:end]), &fields); err != nil {
		return nil, "", false
	}
	return fields, body, true
}

func excerpt(body string, n int) string {
	var out []string
	for _, line := range strings.Split(strings.TrimSpace(body), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
			if len(out) >= n {
				break
			}
		}
	}
	return strings.Join(out, " ")
}

// idLess sorts by numeric suffix when present (T-1 < T-2 < T-10), else lexically.
func idLess(a, b string) bool {
	an, aok := idNum(a)
	bn, bok := idNum(b)
	if aok && bok {
		return an < bn
	}
	return a < b
}

func idNum(id string) (int, bool) {
	i := strings.LastIndexFunc(id, func(r rune) bool { return !unicode.IsDigit(r) })
	if i < 0 || i == len(id)-1 {
		return 0, false
	}
	n, err := strconv.Atoi(id[i+1:])
	return n, err == nil
}
