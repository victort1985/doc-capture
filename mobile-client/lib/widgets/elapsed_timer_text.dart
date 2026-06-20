import 'dart:async';
import 'package:flutter/material.dart';

/// Shows elapsed time between [start] and [end] (or now, if [end] is
/// null — keeps ticking live in that case; a finished session with a
/// real [end] renders once and doesn't keep a timer running).
class ElapsedTimerText extends StatefulWidget {
  const ElapsedTimerText({super.key, required this.start, this.end, this.style});
  final DateTime start;
  final DateTime? end;
  final TextStyle? style;

  @override
  State<ElapsedTimerText> createState() => _ElapsedTimerTextState();
}

class _ElapsedTimerTextState extends State<ElapsedTimerText> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    if (widget.end == null) {
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  String _format(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60);
    final two = (int n) => n.toString().padLeft(2, '0');
    return h > 0 ? '${two(h)}:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
  }

  @override
  Widget build(BuildContext context) {
    final elapsed = (widget.end ?? DateTime.now()).difference(widget.start);
    return Text(_format(elapsed), style: widget.style);
  }
}
