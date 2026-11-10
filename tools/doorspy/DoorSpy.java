// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the CarView authors
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import java.lang.reflect.Method;
import java.text.SimpleDateFormat;
import java.util.Date;

/**
 * Listens to the head unit's MCU/CAN-box messages through the firmware's own android.tw.john.TWUtil
 * (the same library com.tw.service uses) and prints every message with its raw bytes.
 * Run from adb:  CLASSPATH=/data/local/tmp/doorspy.dex app_process / DoorSpy
 */
public class DoorSpy {
    public static void main(String[] args) throws Exception {
        Looper.prepareMainLooper();
        final SimpleDateFormat t = new SimpleDateFormat("HH:mm:ss.SSS");
        Class<?> c = Class.forName("android.tw.john.TWUtil");
        Object tw = c.getConstructor().newInstance();
        short[] ids = { 0x102,0x104,0x106,0x10a,0x10b,0x112,0x201,0x203,0x204,0x205,0x20c,0x210,0x301,0x302,0x404,0x501,0x505,0x507,0x508,0x509,0x50e,0x909,0x270f,(short)0x8201,(short)0x8888,(short)0x9e00,(short)0x9e11,(short)0x9f10,(short)0x9f1b,(short)0x9f1c,(short)0xff00,(short)0xff01,(short)0xff02,(short)0xff04,(short)0xff05,(short)0xff06,(short)0xff09,(short)0xff0a,(short)0xff11,(short)0xff12,(short)0xff13,(short)0xff14,(short)0xff15,(short)0xff16,(short)0xff17,(short)0xff18,(short)0xff19,(short)0xff1a,(short)0xff1b,(short)0xff1c,(short)0xff1d,(short)0xff1e,(short)0xff1f,(short)0xff20,(short)0xff21,(short)0xff22,(short)0xff23,(short)0xff24,(short)0xff25,(short)0xff26,(short)0xff27,(short)0xfff9,(short)0xfffa,(short)0xfffe };
        int r = (Integer) c.getMethod("open", short[].class).invoke(tw, (Object) ids);
        System.out.println("open() = " + r);
        c.getMethod("start").invoke(tw);
        Handler h = new Handler(Looper.myLooper()) {
            @Override public void handleMessage(Message m) {
                StringBuilder sb = new StringBuilder();
                sb.append(t.format(new Date())).append(" what=0x").append(Integer.toHexString(m.what))
                        .append(" arg1=").append(m.arg1).append(" arg2=").append(m.arg2);
                if (m.obj instanceof byte[]) {
                    byte[] b = (byte[]) m.obj;
                    sb.append(" bytes[").append(b.length).append("]=");
                    for (byte x : b) sb.append(String.format(" %02x", x & 0xff));
                    sb.append("  bits:");
                    for (byte x : b) sb.append(' ').append(String.format("%8s", Integer.toBinaryString(x & 0xff)).replace(' ', '0'));
                } else if (m.obj != null) {
                    sb.append(" obj=").append(m.obj);
                }
                System.out.println(sb);
                System.out.flush();
            }
        };
        Method add = c.getMethod("addHandler", String.class, Handler.class);
        add.invoke(tw, "doorspy", h);
        System.out.println("listening...");
        System.out.flush();
        Looper.loop();
    }
}
