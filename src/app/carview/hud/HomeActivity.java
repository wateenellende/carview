// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the CarView authors
package app.carview.hud;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Home-button entry point. Forwards to the dashboard, which lives in its own (split-screen capable) task. */
public class HomeActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        startActivity(i);
        finish();
        overridePendingTransition(0, 0);
    }
}
