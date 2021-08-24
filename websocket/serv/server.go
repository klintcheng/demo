package serv

import (
	"encoding/json"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gobwas/ws"
	"github.com/sirupsen/logrus"
)

// ServerOptions ServerOptions
type ServerOptions struct {
	writewait time.Duration //写超时时间
	readwait  time.Duration //读超时时间
}

// Server is a websocket implement of the Server
type Server struct {
	once    sync.Once
	options ServerOptions
	id      string
	address string
	sync.Mutex
	// 会话列表
	users map[string]net.Conn
}

// NewServer NewServer
func NewServer(id, address string) *Server {
	return newServer(id, address)
}

func newServer(id, address string) *Server {
	return &Server{
		id:      id,
		address: address,
		users:   make(map[string]net.Conn, 100),
		options: ServerOptions{
			writewait: time.Second * 10,
			readwait:  time.Minute * 2,
		},
	}
}

// Start server
func (s *Server) Start() error {
	mux := http.NewServeMux()
	log := logrus.WithFields(logrus.Fields{
		"module": "Server",
		"listen": s.address,
		"id":     s.id,
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		conn, _, _, err := ws.UpgradeHTTP(r, w)
		if err != nil {
			conn.Close()
			return
		}
		// 读取userId
		user := r.URL.Query().Get("user")
		logrus.Infof("user in: %v", user)
		if user == "" {
			conn.Close()
			return
		}

		// 添加到会话管理中
		old, ok := s.addUser(user, conn)
		if ok {
			old.Close()
			conn.Close()
			return
		}
		log.Infof("user %s in from %v", user, conn.RemoteAddr())

		go func(user string, conn net.Conn) {
			err := s.readloop(user, conn)
			if err != nil {
				log.Warn("readloop - ", err)
			}
			conn.Close()
			// 删除用户
			s.delUser(user)

			log.Infof("connection of %s closed", user)
		}(user, conn)
	})
	log.Infoln("started")
	return http.ListenAndServe(s.address, mux)
}

func (s *Server) addUser(user string, conn net.Conn) (net.Conn, bool) {
	s.Lock()
	defer s.Unlock()
	old, ok := s.users[user]
	s.users[user] = conn
	return old, ok
}

func (s *Server) delUser(user string) {
	s.Lock()
	defer s.Unlock()
	delete(s.users, user)
}

// Shutdown Shutdown
func (s *Server) Shutdown() {
	s.once.Do(func() {
		s.Lock()
		defer s.Unlock()
		for _, conn := range s.users {
			conn.Close()
		}
	})
}

func (s *Server) readloop(user string, conn net.Conn) error {
	for {
		frame, err := ws.ReadFrame(conn)
		if err != nil {
			return err
		}
		if frame.Header.Masked {
			ws.Cipher(frame.Payload, frame.Header.Mask, 0)
		}
		// 接收文本帧内容
		if frame.Header.OpCode == ws.OpText {
			go s.handle(user, string(frame.Payload))
		}
	}
}

type Message struct {
	Sequence int    `json:"sequence,omitempty"`
	Type     int    `json:"type,omitempty"`
	Message  string `json:"message,omitempty"`
	From     string `json:"from,omitempty"`
}

func (m *Message) MarshalJSON() []byte {
	bts, _ := json.Marshal(m)
	return bts
}

func parseMessage(text string) *Message {
	var msg Message
	_ = json.Unmarshal([]byte(text), &msg)
	return &msg
}

// 广播消息
func (s *Server) handle(user string, text string) {
	logrus.Infof("recv message %s from %s", text, user)
	s.Lock()
	defer s.Unlock()
	msg := parseMessage(text)
	msg.From = user
	msg.Type = 3 //notify type
	notice := msg.MarshalJSON()
	for u, conn := range s.users {
		if u == user {
			continue
		}
		logrus.Infof("send to %s : %s", u, text)
		err := s.writeText(conn, notice)
		if err != nil {
			logrus.Errorf("write to %s failed, error: %v", user, err)
		}
	}

	conn := s.users[user]
	resp := Message{
		Sequence: msg.Sequence,
		Type:     2, //response type
		Message:  "ok",
	}
	_ = s.writeText(conn, resp.MarshalJSON())
}

func (s *Server) writeText(conn net.Conn, message []byte) error {
	// 创建文本帧数据
	f := ws.NewTextFrame(message)
	err := conn.SetWriteDeadline(time.Now().Add(s.options.writewait))
	if err != nil {
		return err
	}
	return ws.WriteFrame(conn, f)
}
